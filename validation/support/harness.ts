import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { db } from 'app/db.server';
import { gdprRequestTable, sessionTable, shopTable } from 'app/db/schema';
import { apiVersion } from 'app/lib/shopify-api-version';
import { vi } from 'vitest';

import { env } from './cloudflare-workers';

export { db };
export const d1 = env.DB;

export const SECRET = process.env.SHOPIFY_API_SECRET as string;
export const API_KEY = process.env.SHOPIFY_API_KEY as string;

// ---------------------------------------------------------------------------------------------
// Migrations and isolation
// ---------------------------------------------------------------------------------------------

/** Applies the generated `./drizzle` migrations, in journal order, to the empty local D1. */
export async function applyMigrations() {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries) {
    const sql = readFileSync(`drizzle/${tag}.sql`, 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await d1.prepare(statement).run();
    }
  }
}

/** Empties every table. Tables are created once per test file by `applyMigrations`. */
export async function resetData() {
  await d1.batch([
    d1.prepare('DELETE FROM session'),
    d1.prepare('DELETE FROM shop'),
    d1.prepare('DELETE FROM gdpr_request'),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

export const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + n * 60_000);

/** Pins only `Date` (not timers), so Miniflare's async I/O keeps working. */
export function freezeClock(at: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at);
}
export function setClock(at: Date) {
  vi.setSystemTime(at);
}
export function restoreClock() {
  vi.useRealTimers();
}

// ---------------------------------------------------------------------------------------------
// Seeding and reading
// ---------------------------------------------------------------------------------------------

export const SHOP = 'example.myshopify.com';

export async function seedShop(overrides: Partial<typeof shopTable.$inferInsert> = {}) {
  const values: typeof shopTable.$inferInsert = {
    id: 1001,
    myshopifyDomain: SHOP,
    name: 'Seeded Name',
    email: 'seed@example.com',
    contactEmail: 'seed-contact@example.com',
    shopOwnerName: 'Seed Owner',
    primaryDomain: 'seed.example.com',
    countryCode: 'US',
    shopifyPlan: 'Grow',
    shopifyPlus: false,
    partnerDevelopment: false,
    installedAt: T(0),
    uninstalledAt: null,
    createdAt: T(0),
    updatedAt: T(0),
    ...overrides,
  };
  await db.insert(shopTable).values(values);
  return values;
}

export async function seedSession(
  shop = SHOP,
  id = `offline_${shop}`,
  overrides: Partial<typeof sessionTable.$inferInsert> = {},
) {
  await db.insert(sessionTable).values({
    id,
    shop,
    state: 'state',
    isOnline: false,
    accessToken: 'token',
    ...overrides,
  });
}

/** An offline Session whose access token has expired and whose refresh token is still current. */
export async function seedExpiredSession(shop = SHOP) {
  await seedSession(shop, `offline_${shop}`, {
    expires: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    refreshToken: 'stale-refresh-token',
    refreshTokenExpires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
}

export async function readShops() {
  return db.select().from(shopTable);
}
export async function readShop(domain = SHOP) {
  return (await readShops()).find(s => s.myshopifyDomain === domain);
}
export async function sessionIds(shop?: string) {
  const rows = await db.select().from(sessionTable);
  return rows
    .filter(r => !shop || r.shop === shop)
    .map(r => r.id)
    .sort();
}
export async function readGdprRequests() {
  return db.select().from(gdprRequestTable);
}

// ---------------------------------------------------------------------------------------------
// Deterministic interleaving
// ---------------------------------------------------------------------------------------------

/**
 * Runs `interleave` after the Shop lookup that every persistence function starts with has returned,
 * and before the function's next statement. This is a deterministic stand-in for another request
 * writing between the function's read and its write/batch.
 *
 * Applies to the next `count` lookups only; later lookups behave normally.
 */
export function afterShopRead(interleave: () => Promise<void>, count = 1) {
  const original = db.query.shopTable.findFirst.bind(db.query.shopTable);
  let remaining = count;
  return vi.spyOn(db.query.shopTable, 'findFirst').mockImplementation(((...args: unknown[]) =>
    (async () => {
      const result = await (original as (...a: unknown[]) => Promise<unknown>)(...args);
      if (remaining > 0) {
        remaining -= 1;
        await interleave();
      }
      return result;
    })()) as never);
}

// ---------------------------------------------------------------------------------------------
// Signed requests for the real Shopify library
// ---------------------------------------------------------------------------------------------

export interface WebhookOptions {
  topic: string;
  shop?: string;
  payload?: Record<string, unknown>;
  webhookId?: string;
  triggeredAt?: Date | string | null;
  secret?: string;
}

/** A webhook delivery signed like Shopify's, for the real `authenticate.webhook`. */
export function webhookRequest({
  topic,
  shop = SHOP,
  payload = {},
  webhookId = 'webhook-1',
  triggeredAt = T(10),
  secret = SECRET,
}: WebhookOptions) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-Shopify-Topic': topic,
    'X-Shopify-Shop-Domain': shop,
    'X-Shopify-Webhook-Id': webhookId,
    'X-Shopify-API-Version': apiVersion,
    'X-Shopify-Hmac-Sha256': createHmac('sha256', secret).update(body).digest('base64'),
  };
  if (triggeredAt) {
    headers['X-Shopify-Triggered-At'] =
      typeof triggeredAt === 'string' ? triggeredAt : triggeredAt.toISOString();
  }
  return new Request(`https://app.example.com/webhooks/${topic}`, {
    method: 'POST',
    headers,
    body,
  });
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** An App Bridge session token (HS256 JWT) as embedded admin requests carry it. */
export function sessionToken(shop = SHOP) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: `https://${shop}/admin`,
      dest: `https://${shop}`,
      aud: API_KEY,
      sub: '42',
      exp: now + 60,
      nbf: now - 10,
      iat: now - 10,
      jti: crypto.randomUUID(),
      sid: crypto.randomUUID(),
    }),
  );
  const signature = createHmac('sha256', SECRET).update(`${header}.${claims}`).digest();
  return `${header}.${claims}.${base64url(signature)}`;
}

/** A fetch-style admin request, as the embedded app sends it, for the real `authenticate.admin`. */
export function adminRequest(shop = SHOP) {
  return new Request('https://app.example.com/app', {
    headers: { Authorization: `Bearer ${sessionToken(shop)}` },
  });
}
