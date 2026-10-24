# Webhooks

How the starter authenticates webhook deliveries. Route-by-route behavior, subscriptions and the install and compliance flows are added to this guide as they land.

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

## Mandatory compliance webhooks

Shopify requires every app to handle three compliance topics. Each delivery is persisted as a
**GDPR Request** (see [database.md](./database.md#gdpr-request-gdpr_request) for the schema,
scrub policy and retention) before anything is done for it.

| Topic                     | Route                                    | Behavior                          |
| ------------------------- | ---------------------------------------- | --------------------------------- |
| `customers/data_request`  | `webhooks.customers.data_request.tsx`    | Documented no-op, then `processed` |
| `customers/redact`        | `webhooks.customers.redact.tsx`          | Documented no-op, then `processed` |

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
