# Webhooks

How the starter authenticates webhook deliveries. Route-by-route behavior, subscriptions and the install and compliance flows are added to this guide as they land.

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
