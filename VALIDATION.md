# D1 lifecycle validation (throwaway branch)

Evidence for [#26](https://github.com/extend-commerce/shopify-react-router-starter/issues/26),
under parent [#20](https://github.com/extend-commerce/shopify-react-router-starter/issues/20)
and the
[Lifecycle test plan](https://github.com/extend-commerce/shopify-react-router-starter/issues/13#issuecomment-6385528814).
This branch is **not** to be merged: the harness, the `miniflare` dependency and the tests exist
only to preserve this evidence.

## What was tested

| Item                       | Value                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| Implementation SHA (tested) | `d56a3649d8c423c2da6b5159f7935d756735eef0` (`feat/shop-gdpr-lifecycle`) |
| Validation branch          | `test/d1-lifecycle-validation`                                         |
| Harness commit             | `86e26e9` (`test: add local D1 validation harness`)                    |
| Test commit                | `4b43ee6` (`test: validate Shop and GDPR lifecycle against local D1`)  |
| App code changes on branch | none (`app/`, `docs/`, `drizzle/`, TOML files are identical to the implementation SHA) |

The branch history is: implementation SHA, then the harness commit, then the test commit, then
the commit adding this file. Only `package.json`/`pnpm-lock.yaml` (adds `miniflare` and
`test:d1`), `validation/` and this file differ from the implementation.

## Harness

- **Real local D1:** [`miniflare`](https://www.npmjs.com/package/miniflare) `4.20260730.0`
  (workerd, the same engine as `wrangler dev` and `wrangler d1 --local`), one in-memory D1 per
  test file. `miniflare` 4 was chosen over the 5.x beta that `wrangler` 4.151.0 bundles because the
  beta has a different, config-file based constructor. `db.batch`, `RETURNING`, `ON CONFLICT` and
  `NOT EXISTS` therefore run on real D1 semantics. No production or remote database is touched.
- **Real code under test:** `app/db.server.ts` (via an alias of `cloudflare:workers` to the
  Miniflare binding), `app/server/shop.server.ts`, `app/server/gdpr-request.server.ts`, the real
  `app/routes/webhooks.*.tsx` actions, the real `authenticate.admin` / `authenticate.webhook`
  wrappers (including the expired-token fallback) on top of the real Shopify library and the
  real Drizzle session storage.
- **Migrations:** the generated `./drizzle/*.sql` files are applied in `_journal.json` order.
- **Mocked Shopify HTTP:** Admin GraphQL and the token endpoint are answered locally by a
  `fetch` stub for `*.myshopify.com`. Webhooks are signed with the app secret (HMAC-SHA256) and
  admin requests carry an HS256 App Bridge session token, so authentication is not bypassed.
- **Determinism:** only `Date` is faked. Races are reproduced by running a write between a
  function's initial Shop read and its write/batch (`afterShopRead`), not by timing.
- **Failure injection:** `completeGdprRequest` is wrapped and made to fail once; `db.batch` is
  made to fail once.
- **Isolation:** tables are emptied before every test; each test file has its own database.

## Commands and results

Run on `pnpm install`, `pnpm exec graphql-codegen`, `pnpm router-typegen` at a clean checkout.

| Command                                             | Result                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm lint`                                         | pass (0 warnings, 0 errors)                                           |
| `pnpm format:check`                                 | pass                                                                  |
| `pnpm typecheck`                                    | pass                                                                  |
| `pnpm test`                                         | pass: 9 files, 76 tests, including the expired-token canary (`app/lib/webhook-auth-fallback.canary.test.ts`: the real library still throws a bare 500, so the fallback stays) |
| `pnpm exec wrangler d1 migrations apply DB --local` | pass: all 3 migrations applied to a fresh local D1                    |
| `pnpm db:generate`                                  | "No schema changes, nothing to migrate" (migrations match the schema) |
| `pnpm test:d1`                                      | 166 passed, **1 failed** (finding F1, docs only); 8 files, 167 tests  |

Results of `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test` were identical
on the implementation SHA before the harness was added and on the harness branch (the harness
files are linted, formatted and typechecked too).

`pnpm test:d1` breakdown:

| File                                    | Tests | Covers                                                                                           |
| --------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `validation/schema.test.ts`             | 8     | migrated columns/types/nullability, unique domain, `shopId` index, `pending` default, no FKs, Session table |
| `validation/ensure-shop.test.ts`        | 22    | first install, lazy init, reinstall, already installed (no snapshot), snapshot failure, timestamps, concurrent upsert, real `authenticate.admin` wrapper incl. token exchange |
| `validation/refresh-shop.test.ts`       | 14    | update-only refresh, no insert/revive, race to uninstalled, retryable failures, `shop/update` route incl. no Session and non-allowlisted 500 |
| `validation/uninstall.test.ts`          | 22    | equality/older stale, duplicates, missing-Shop Session deletion, reinstall between read and batch (SQL guards, both paths), route incl. expired-token fallback, bad HMAC, missing/invalid triggered-at |
| `validation/gdpr.test.ts`               | 40    | insert-first, wire topic mapping, email/phone scrub with retained ids, terminal dedupe, pending retry, completion timestamps, malformed payloads, both customer routes with and without a Shop |
| `validation/redact.test.ts`             | 17    | uninstalled/missing/installed-skip, GDPR retention, deterministic reinstall between read and batch, route outcomes, failure after redaction before completion then retry, fresh Shop after redaction |
| `validation/scopes-update.test.ts`      | 3     | `app/scopes_update` writes only the Session scope                                                |
| `validation/subscriptions-docs.test.ts` | 41    | six subscriptions in both TOML files map to the intended handlers; documentation coverage        |

Mutation check (not committed): 15 deliberate breakages of `shop.server.ts` and
`gdpr-request.server.ts` (dropping each SQL guard, the strict-later comparison, the `CASE` that
keeps `installedAt`, the `createdAt` preservation, the scrub, the dedupe, `processedAt`, ...) were
each caught by at least one test.

## Subscriptions and documentation

`shopify.app.toml` and `shopify.app.staging.toml` declare the same six subscriptions, API version
`2026-10`, matching `app/lib/shopify-api-version.ts`:

| Topic                    | URI                                | Handler                                        |
| ------------------------ | ---------------------------------- | ---------------------------------------------- |
| `app/uninstalled`        | `/webhooks/app/uninstalled`        | `uninstallShop`                                |
| `app/scopes_update`      | `/webhooks/app/scopes_update`      | Session scope update only                      |
| `shop/update`            | `/webhooks/shop/update`            | `refreshShop`                                  |
| `customers/data_request` | `/webhooks/customers/data_request` | record, documented no-op, `processed`          |
| `customers/redact`       | `/webhooks/customers/redact`       | record, documented no-op, `processed`          |
| `shop/redact`            | `/webhooks/shop/redact`            | record, `redactShop`, `processed` or `skipped` |

The three mandatory topics use `compliance_topics`, the other three `topics`. `docs/webhooks.md`,
`docs/database.md`, `docs/development-practices.md` and `CONTEXT.md` cover the final behavior,
the retry/reinstall guards, the fallback and its retirement, and the extension points
(`redactShop`, customer erase/export routes) accurately.

## Findings

| ID | Severity | Finding                                                                                                      | Status |
| -- | -------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| F1 | Low (docs) | `docs/README.md` describes the Database guide as covering "the `session` and `shop` tables" and gives no summary of the Webhooks guide, so the index does not describe all three stored entities (`gdpr_request`) as the parent spec requires. | Fixed on local branch `fix/validation-findings` (`42e10f5`, based on the implementation SHA, not pushed). After the fix `pnpm test:d1` passes 167/167. **Unresolved on the implementation branch until the fix is brought back and revalidated against a new SHA.** |

No persistence, SQL, migration, idempotency or race-guard defects were found. Observations that
are not defects: a reinstall that completes before the `app/uninstalled` delivery for the old
install is processed keeps the old install period and has its new Session removed by the late
uninstall; the next admin request re-authenticates and starts a new period (the accepted
self-healing race already described in the docs). The installed
`@shopify/shopify-app-react-router` prints a stray `console.log` during token exchange.

## Reproducing

```bash
git checkout test/d1-lifecycle-validation
pnpm install
pnpm exec graphql-codegen && pnpm router-typegen
pnpm test:d1
```
