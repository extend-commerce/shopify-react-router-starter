import { type Database } from 'app/db.server';
import { sessionTable, shopTable } from 'app/db/schema';
import { GET_SHOP_SNAPSHOT } from 'app/graphql/queries';
import { type AdminApiContextWithoutRest } from 'app/shopify.server';
import { type GetShopSnapshotQuery } from 'app/types/admin.generated';
import { and, eq, isNotNull, isNull, notExists, sql } from 'drizzle-orm';

/** A row of the `shop` table: the merchant tenant, identified by its myshopify domain. */
export type Shop = typeof shopTable.$inferSelect;

type ShopMetadata = Pick<
  typeof shopTable.$inferInsert,
  | 'id'
  | 'name'
  | 'email'
  | 'contactEmail'
  | 'shopOwnerName'
  | 'primaryDomain'
  | 'countryCode'
  | 'shopifyPlan'
  | 'shopifyPlus'
  | 'partnerDevelopment'
>;

// Shop GIDs look like `gid://shopify/Shop/12345678`; the table keys on the number.
function parseShopId(gid: string) {
  const id = /^gid:\/\/shopify\/Shop\/(\d+)$/.exec(gid)?.[1];
  if (!id) throw new Error(`Unexpected Shop GID: ${gid}`);
  return Number(id);
}

// Admin GraphQL is the canonical source of Shop metadata. Never returns a partial snapshot: a
// response without a Shop (for example a throttled or failed query) throws with its GraphQL errors.
async function fetchShopSnapshot(admin: AdminApiContextWithoutRest): Promise<ShopMetadata> {
  const response = await admin.graphql(GET_SHOP_SNAPSHOT);
  // The client's response type omits `errors`, but a failed query carries them in the body.
  const { data, errors }: { data?: GetShopSnapshotQuery; errors?: unknown } = await response.json();

  if (!data?.shop) {
    throw new Error(`Failed to fetch the Shop snapshot: ${JSON.stringify(errors ?? null)}`, {
      cause: errors,
    });
  }

  const { shop } = data;
  return {
    id: parseShopId(shop.id),
    name: shop.name,
    email: shop.email,
    contactEmail: shop.contactEmail,
    shopOwnerName: shop.shopOwnerName,
    primaryDomain: shop.primaryDomain.host,
    countryCode: shop.billingAddress.countryCodeV2 ?? null,
    shopifyPlan: shop.plan.publicDisplayName,
    shopifyPlus: shop.plan.shopifyPlus,
    partnerDevelopment: shop.plan.partnerDevelopment,
  };
}

/**
 * Looks up a Shop by its myshopify domain with one indexed query.
 *
 * Uninstalled Shops are returned too; check `uninstalledAt` to tell them apart. Does not touch
 * Admin GraphQL or write anything.
 *
 * @param db The database handle.
 * @param domain The `*.myshopify.com` domain, as in `session.shop`.
 * @returns The Shop row, or `undefined` when none exists (never installed, or erased by redaction).
 * @throws If the database query fails.
 */
export async function getShop(db: Database, domain: string): Promise<Shop | undefined> {
  return db.query.shopTable.findFirst({ where: eq(shopTable.myshopifyDomain, domain) });
}

/**
 * Makes sure an installed Shop row exists for the domain and returns it.
 *
 * An installed row (`uninstalledAt` is null) is returned as is, with no Admin GraphQL call. A
 * missing row (first install, or a Shop that predates this table) or an uninstalled one
 * (reinstall) takes a fresh Admin GraphQL snapshot and upserts it by Shop ID:
 *
 * - Insert: `createdAt` and `installedAt` are set to now.
 * - Conflict: metadata, domain and `updatedAt` are refreshed, `uninstalledAt` is cleared and
 *   `createdAt` is kept. `installedAt` advances only if the stored row is still uninstalled, so
 *   concurrent first loads that race on the same Shop do not keep moving the install period's start.
 *
 * Concurrent initialization is accepted without locks. Does not log.
 *
 * @param db The database handle.
 * @param domain The `*.myshopify.com` domain of the authenticated Session.
 * @param admin The Admin GraphQL client of the authenticated request.
 * @returns The installed Shop row.
 * @throws If the snapshot cannot be fetched (the Error carries any GraphQL errors) or the database
 * query or upsert fails. Callers should fail the request rather than continue without a Shop.
 */
export async function ensureShop(
  db: Database,
  domain: string,
  admin: AdminApiContextWithoutRest,
): Promise<Shop> {
  const existing = await getShop(db, domain);
  if (existing && !existing.uninstalledAt) return existing;

  const { id, ...metadata } = await fetchShopSnapshot(admin);
  const now = new Date();

  // In an ON CONFLICT update, `shopTable.uninstalledAt` is the stored value from before this
  // statement's own `uninstalledAt = NULL`, so the CASE sees whether the row was uninstalled.
  const [shop] = await db
    .insert(shopTable)
    .values({
      id,
      ...metadata,
      myshopifyDomain: domain,
      installedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: shopTable.id,
      set: {
        ...metadata,
        myshopifyDomain: domain,
        installedAt: sql`CASE WHEN ${shopTable.uninstalledAt} IS NULL THEN ${shopTable.installedAt} ELSE ${now.getTime()} END`,
        uninstalledAt: null,
        updatedAt: now,
      },
    })
    .returning();

  return shop;
}

/**
 * Erases an uninstalled (or already missing) Shop and its Sessions after Shopify's `shop/redact`
 * request. It is the starter's only Shop erasure and knows nothing about GDPR Requests: those rows,
 * including the one being processed, are left intact for the caller to complete.
 *
 * Guards:
 *
 * - An installed Shop (`uninstalledAt` is null) at the initial read returns `skipped` and deletes
 *   nothing: the redaction belongs to an earlier installation that has since been replaced.
 * - Otherwise one D1 batch deletes the Sessions with `session.shop` equal to the domain, but only
 *   while no installed Shop with that domain exists when the statement runs, and deletes the Shop
 *   row, but only while it is uninstalled. These predicates protect a Shop that reinstalls between
 *   the initial read and the batch. If that happens every delete matches nothing and the call
 *   still returns `redacted`; the caller completes the request as processed.
 * - A missing Shop is a valid case: the Sessions are still deleted and deleting nothing succeeds,
 *   so a retry after a failure that came later is idempotent.
 *
 * The call is safe to repeat. A later install after redaction creates a fresh Shop row. Does not
 * log.
 *
 * EXTENSION POINT: if your app adds tables keyed by Shop, delete from them as extra statements in
 * the batch below, with the same installed-Shop guard as the Session delete. Without it, a
 * reinstalled Shop would lose its current data to a redaction from an earlier uninstall.
 *
 * Accepted narrow race: token exchange can store a Session just before the admin authentication
 * wrapper establishes the reinstalled Shop row. A redaction in that window removes that Session,
 * and the next admin request authenticates again and recovers.
 *
 * @param db The database handle.
 * @param domain The `*.myshopify.com` domain from the webhook.
 * @returns `redacted` when the deletion batch ran, `skipped` when the Shop is installed.
 * @throws If the database query or batch fails. The batch applies atomically, and the caller must
 * not complete the GDPR Request.
 */
export async function redactShop(db: Database, domain: string): Promise<'redacted' | 'skipped'> {
  const shop = await getShop(db, domain);
  if (shop && !shop.uninstalledAt) return 'skipped';

  const installedShop = db
    .select({ id: shopTable.id })
    .from(shopTable)
    .where(and(eq(shopTable.myshopifyDomain, domain), isNull(shopTable.uninstalledAt)));

  await db.batch([
    db.delete(sessionTable).where(and(eq(sessionTable.shop, domain), notExists(installedShop))),
    db
      .delete(shopTable)
      .where(and(eq(shopTable.myshopifyDomain, domain), isNotNull(shopTable.uninstalledAt))),
  ]);

  return 'redacted';
}
