# Webhooks

How the starter authenticates and handles webhook deliveries: subscriptions, the Shop lifecycle topics and the mandatory compliance topics.

## Subscriptions and routes

Webhook subscriptions are declared in the app configuration TOML files
([`shopify.app.toml`](../shopify.app.toml) and
[`shopify.app.staging.toml`](../shopify.app.staging.toml)) and are delivered to one route per
topic in `app/routes`, named `webhooks.<topic>.tsx` (for example
`webhooks.customers.redact.tsx` handles `customers/redact`). Each route calls
`authenticate.webhook(request)` from `app/shopify.server.ts`, which verifies the HMAC and returns
the normalized topic (`CUSTOMERS_REDACT`), the webhook ID, and the payload. Subscriptions take
effect when the app configuration is deployed with `pnpm deploy`.

## Authentication

Every webhook route calls `authenticate.webhook(request)` from `app/shopify.server.ts`. It verifies the HMAC of the raw body with `SHOPIFY_API_SECRET`, then returns the webhook context (`shop` domain, normalized `topic`, `webhookId`, `payload`, ...). `session` and `admin` are `undefined` when the shop has no stored Session, so handlers must check `session` before using it.

### Expired offline token fallback

The Shopify library also refreshes the stored offline token (the app uses expiring offline tokens) before it returns. When Shopify rejects that refresh, the library throws a bare `500` Response. That always happens after uninstall, because the token is gone, so `app/uninstalled` and the mandatory compliance webhooks would fail on every retry until Shopify gives up, and the cleanup would never run. This is a known upstream bug: [shopify-app-js#3360](https://github.com/Shopify/shopify-app-js/issues/3360), with a proposed fix in [#3443](https://github.com/Shopify/shopify-app-js/pull/3443).

The `authenticate.webhook` wrapper (`app/lib/webhook-auth-fallback.ts`) works around it:

- **Only a thrown `500` Response on an allowlisted topic triggers it.** Successful results and every other failure (401, 400, 405, other errors) pass through unchanged.
- **The allowlist is exactly** `app/uninstalled`, `shop/redact`, `customers/redact` and `customers/data_request`. A `500` on any other topic is rethrown, so Shopify retries the delivery.
- **The HMAC is verified again, independently.** The wrapper clones the request before calling the library, then checks the HMAC-SHA256 of the raw body against `SHOPIFY_API_SECRET` with WebCrypto (`crypto.subtle.verify`, a constant-time comparison). A mismatch throws `401`. The library's `500` is never treated as proof that the request is genuine.
- **The context has no Session.** It carries the same fields the library returns for a shop without a Session: `shop`, normalized `topic`, `webhookId`, `apiVersion`, `triggeredAt`, `payload` and `webhookType`, with `session` and `admin` both `undefined`. There is no flag marking that a refresh failed.
- **Use is logged at `warn`** under `app.webhooks`, with `shop`, `topic` and `webhookId`.

Handlers for the allowlisted topics already have to work without a Session, so they need no special case.

### Retiring the fallback

`app/lib/webhook-auth-fallback.canary.test.ts` runs the real library against an expired stored Session whose refresh fails, and asserts that it still throws a `500`. When a dependency upgrade makes that test fail, the library has fixed the problem. Remove the fallback, the canary and this section (the `TODO` in the fallback links the upstream issue and fix), then check how the library behaves for each topic. Do not weaken the canary's assertion to make it pass.

## Shop lifecycle webhooks

Three topics keep the Shop (see [database.md](./database.md#shop-vs-session)) and the Sessions
accurate. Each has one route and a subscription in both TOML files. Persistence functions live in
`app/server/shop.server.ts`; the routes log their outcome under `app.webhooks`.

| Topic               | Route                               | Action                                                         |
| ------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `shop/update`       | `webhooks.shop.update.tsx`          | `refreshShop`: refresh metadata of an installed Shop           |
| `app/uninstalled`   | `webhooks.app.uninstalled.tsx`      | `uninstallShop`: mark the Shop uninstalled, delete its Sessions |
| `app/scopes_update` | `webhooks.app.scopes_update.tsx`    | Store the new scopes on the Session; never writes Shop data    |

### Shop update

1. If the webhook context has no `admin` (no stored Session), the route returns 200 and does
   nothing.
2. Otherwise `refreshShop` fetches a fresh Admin GraphQL snapshot (the webhook's REST-shaped
   payload is not used) and updates the row **only if it exists and is installed**. It never
   inserts a row or revives an uninstalled Shop, so a delayed update cannot undo an uninstall. The
   outcome is `refreshed` or `not_installed` (logged at `info`).
3. Snapshot and write errors propagate, so Shopify retries the delivery.

### Uninstall

`uninstallShop` works from the shop domain and the event's triggered-at time, never from a
Session, so it runs even when authentication produced none (see the fallback above).

- **Shop row exists and `triggeredAt` is strictly later than `installedAt`:** one D1 batch sets
  `uninstalledAt` to the event time and `updatedAt` to now, and deletes every Session for the
  domain. The Shop row and its metadata are kept. Repeating the delivery gives the same result.
  Outcome `uninstalled`.
- **`triggeredAt` equal to or older than `installedAt`:** the event belongs to an earlier install
  period, e.g. a delayed delivery after a Reinstall. Nothing changes, so the current Shop and
  Sessions are preserved, and there is no Admin API probe. Outcome `stale` (logged at `info`).
- **No Shop row** (an install that predates the `shop` table, or a redacted Shop): the Sessions are
  still deleted. Outcome `missing` (logged at `info`).

The route falls back to the receipt time if `X-Shopify-Triggered-At` is absent or unparseable.

Accepted race: token exchange can store a new Session just before the admin wrapper establishes the
reinstalled Shop, and an uninstall cleanup running in that window deletes it. The next admin request
authenticates again and recovers. There are no locks or recovery mechanism.

### Scopes update

Unchanged: the route stores the new scope list on the Session when there is one. It does not touch
the Shop.

### Flows

- **Install:** the first admin request inserts the Shop (`createdAt` and `installedAt` = now).
- **Uninstall:** `app/uninstalled` marks the Shop uninstalled and deletes its Sessions. The Shop row
  stays; `shop/update` events for it are acknowledged without effect.
- **Reinstall:** the next admin request sees an uninstalled Shop, takes a fresh snapshot, clears
  `uninstalledAt` and advances `installedAt`. An `app/uninstalled` still in flight from the earlier
  install period is `stale` and leaves the new installation alone.

## Mandatory compliance webhooks

Shopify requires every app to handle three compliance topics. Each delivery is persisted as a
**GDPR Request** (see [database.md](./database.md#gdpr-request-gdpr_request) for the schema,
scrub policy and retention) before anything is done for it.

| Topic                     | Route                                    | Behavior                          |
| ------------------------- | ---------------------------------------- | --------------------------------- |
| `customers/data_request`  | `webhooks.customers.data_request.tsx`    | Documented no-op, then `processed` |
| `customers/redact`        | `webhooks.customers.redact.tsx`          | Documented no-op, then `processed` |
| `shop/redact`             | `webhooks.shop.redact.tsx`               | `redactShop`, then `processed` or `skipped` |

### Customer topics

The starter stores no customer data, so there is nothing to export for `customers/data_request`
and nothing to erase for `customers/redact`. Both routes still run the full lifecycle so the
request is auditable:

1. Authenticate the webhook.
2. `recordGdprRequest` inserts a `pending` row with `customer.email` and `customer.phone` removed,
   conflicting on the webhook ID (not the event ID). It returns the `pending` row, or `null` when
   the same webhook already reached `processed` or `skipped`.
3. On `null` the route returns 200 and does nothing else, so redeliveries are safe.
4. Otherwise the route performs its action (a no-op in the starter) and calls
   `completeGdprRequest(..., 'processed')`, which sets the status and `processedAt` together.

Neither route depends on a Shop record existing; both work for any shop domain.

### Shop redaction (`shop/redact`)

Shopify sends `shop/redact` some time after an uninstall. The route
(`app/routes/webhooks.shop.redact.tsx`) sequences the same lifecycle explicitly, with no callback
abstraction:

1. Authenticate the webhook, then `recordGdprRequest`. A `null` result is a terminal duplicate:
   return 200 and do nothing else. A still-`pending` row continues.
2. `redactShop(db, webhook.shop)` returns `redacted` or `skipped`.
3. `completeGdprRequest` maps `redacted` to `processed` and `skipped` to `skipped`. The status
   flip is a separate write, not part of the deletion batch.

| `redactShop` outcome | When                                                      | Request status |
| -------------------- | --------------------------------------------------------- | -------------- |
| `skipped`            | The Shop is installed (it reinstalled since the uninstall) | `skipped`      |
| `redacted`           | The Shop is uninstalled or missing: Sessions and Shop deleted | `processed`    |

- **Missing Shop:** still `redacted`. The Sessions are deleted and the Shop delete matches
  nothing, so cleanup is idempotent and also covers Shops that predate the `shop` table.
- **Reinstall protection:** the deletes are guarded by installed-Shop predicates, so a reinstall
  between the initial read and the batch leaves the new Shop and Sessions intact (the call may
  then still report `redacted`). Details in
  [database.md](./database.md#shop-redaction).
- **GDPR evidence is preserved:** no `gdpr_request` row is deleted, including the current one.
- **Retry:** if the deletion throws, the route does not complete the request and the failure
  propagates, so it stays `pending` and Shopify redelivers. If the deletion succeeds but
  completion fails, the request also stays `pending`; the redelivery repeats the deletes against
  the now missing Shop (no-ops) and completes it as `processed`. No queue, lock or tombstone is
  involved.
- **Fresh Shop afterwards:** a later install after redaction creates a new Shop row.
- **Extension point:** forks with Shop-scoped tables add their deletes to `redactShop`, with the
  same installed-Shop guard.

### Retries

Failures are never swallowed. If recording or completing the request throws, the route throws and
Shopify redelivers the webhook. A request that was recorded but not completed is still `pending`,
so the redelivery resumes processing it. There is no processing lock, queue or automatic redrive:
Shopify's retries are the redrive mechanism. Rows are kept indefinitely as audit evidence.

### Extension points for forks

If your app stores customer data, handle it in the route where the starter currently does
nothing, before the `completeGdprRequest` call:

- **`customers/data_request`:** export the customer's data (`customer.id`, `orders_requested`,
  `data_request.id` in the payload) and deliver it to the merchant.
- **`customers/redact`:** erase the customer's data (`customer.id`, `orders_to_redact`).

Keep the action idempotent, because a failure before completion leads to a redelivery. Use
`completeGdprRequest(db, id, 'skipped')` if a request is deliberately not applicable.
