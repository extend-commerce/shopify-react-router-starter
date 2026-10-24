// Stand-in for the `cloudflare:workers` module (aliased in validation/vitest.config.ts) so the
// app's real `db.server.ts` runs under Node on top of a real local D1 database.
//
// Miniflare runs the same workerd/D1 implementation as `wrangler dev` and `wrangler d1 ... --local`,
// so `db.batch`, `RETURNING`, `ON CONFLICT` and `NOT EXISTS` subqueries behave as they do in
// production. Each test file gets its own in-memory instance (Vitest isolates module graphs per
// file), so no data is shared between files and no production database is ever touched.
import { Miniflare } from 'miniflare';

export const miniflare = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("ok"); } }',
  compatibilityDate: '2026-01-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: '00000000-0000-0000-0000-000000000000' },
});

export const env = { DB: await miniflare.getD1Database('DB') };
