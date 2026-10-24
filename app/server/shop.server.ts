import { type Database } from 'app/db.server';
import { sessionTable, shopTable } from 'app/db/schema';
import { GET_SHOP_SNAPSHOT } from 'app/graphql/queries';
import { type AdminApiContextWithoutRest } from 'app/shopify.server';
import { type GetShopSnapshotQuery } from 'app/types/admin.generated';
import { and, eq, isNull, sql } from 'drizzle-orm';

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
 * Refreshes the metadata of an installed Shop from a fresh Admin GraphQL snapshot, for the
 * `shop/update` webhook.
 *
 * It only updates an existing row whose `uninstalledAt` is null, and never inserts one or revives
 * an uninstalled Shop, so a delayed update cannot undo an uninstall. Without an installed row it
 * returns before fetching anything. The write repeats the installed check in SQL, so a Shop
 * uninstalled between the lookup and the write is also reported as `not_installed`. Does not log.
 *
 * @param db The database handle.
 * @param domain The `*.myshopify.com` domain, as in the webhook context's `shop`.
 * @param admin The Admin GraphQL client of the webhook context.
 * @returns `refreshed` when the row was updated; `not_installed` when there is no installed row.
 * @throws If the snapshot cannot be fetched (the Error carries any GraphQL errors) or the database
 * fails. Callers should let it propagate so Shopify retries the delivery.
 */
export async function refreshShop(
  db: Database,
  domain: string,
  admin: AdminApiContextWithoutRest,
): Promise<'refreshed' | 'not_installed'> {
  const existing = await getShop(db, domain);
  if (!existing || existing.uninstalledAt) return 'not_installed';

  // The Shop ID never changes, so it is not part of the update.
  const { id: _id, ...metadata } = await fetchShopSnapshot(admin);
  const updated = await db
    .update(shopTable)
    .set({ ...metadata, updatedAt: new Date() })
    .where(and(eq(shopTable.myshopifyDomain, domain), isNull(shopTable.uninstalledAt)))
    .returning({ id: shopTable.id });

  return updated.length > 0 ? 'refreshed' : 'not_installed';
}

/**
 * Records an uninstall and deletes the domain's Sessions, for the `app/uninstalled` webhook. It
 * works from the domain alone, so it does not need an authenticated Session.
 *
 * - **Shop exists, `triggeredAt` is strictly later than `installedAt`:** in one D1 batch, sets
 *   `uninstalledAt` to `triggeredAt` and `updatedAt` to now, and deletes every Session with this
 *   domain. Metadata is kept as is. Repeating the same event gives the same result.
 * - **Shop exists, `triggeredAt` is equal or older:** the event belongs to an earlier install
 *   period, so nothing is changed (the current Shop and Sessions stay) and no Admin API call is made.
 * - **No Shop row** (a pre-feature install, or after redaction): still deletes the Sessions.
 *
 * Accepted race: token exchange can store a Session just before the admin wrapper reinstalls the
 * Shop, and a cleanup running in that window deletes it. The next admin request self-heals, so
 * there is no locking. Does not log.
 *
 * @param db The database handle.
 * @param domain The `*.myshopify.com` domain, as in the webhook context's `shop`.
 * @param triggeredAt When Shopify triggered the event (`X-Shopify-Triggered-At`).
 * @returns `uninstalled` when the Shop was marked uninstalled; `stale` when the event was ignored;
 * `missing` when there was no Shop row.
 * @throws On a database error. Callers should let it propagate so Shopify retries the delivery.
 */
export async function uninstallShop(
  db: Database,
  domain: string,
  triggeredAt: Date,
): Promise<'uninstalled' | 'stale' | 'missing'> {
  const existing = await getShop(db, domain);

  if (!existing) {
    await db.delete(sessionTable).where(eq(sessionTable.shop, domain));
    return 'missing';
  }

  if (triggeredAt.getTime() <= existing.installedAt.getTime()) return 'stale';

  await db.batch([
    db
      .update(shopTable)
      .set({ uninstalledAt: triggeredAt, updatedAt: new Date() })
      .where(eq(shopTable.myshopifyDomain, domain)),
    db.delete(sessionTable).where(eq(sessionTable.shop, domain)),
  ]);
  return 'uninstalled';
}
