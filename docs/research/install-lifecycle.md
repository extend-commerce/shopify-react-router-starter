# Research: install lifecycle under managed install

Answers [#5](https://github.com/extend-commerce/shopify-react-router-starter/issues/5) (map: [#3](https://github.com/extend-commerce/shopify-react-router-starter/issues/3)).
Researched 2026-10-11 against the installed packages and shopify.dev.

- `@shopify/shopify-app-react-router` **3.0.0** (lockfile). The latest is 3.0.2. Its changelog lists only dependency bumps, and the files cited below are identical in 3.0.2 (checked on unpkg).
- `@shopify/shopify-api` **15.0.0**.
- Repo config: `AppDistribution.AppStore`, `useOnlineTokens` unset (so `false`), `future.expiringOfflineAccessTokens: true`, no `hooks` (`app/shopify.server.ts`).

Source paths below are shortened:

- `RR/` = `node_modules/@shopify/shopify-app-react-router/dist/esm/server/`
- `API/` = `node_modules/@shopify/shopify-api/dist/esm/lib/`

## TL;DR

1. **`afterAuth` runs whenever the library does a token exchange.** That covers first install, reinstall, and roughly once an hour for every active shop, because with expiring offline tokens the admin path never refreshes. When the offline token is within 5 minutes of expiry, the admin path runs a new token exchange. It is not called when a refresh token is used (webhooks, `unauthenticated.admin`). Nothing tells the hook why it ran.
2. **Neither Shopify nor the library separates install from reinstall.** No install webhook exists. The app has to work it out from its own state: a `shop` row that outlives uninstall, plus an `uninstalledAt` marker set by `app/uninstalled`.
3. **`app/uninstalled` can arrive late, twice, or out of order.** Retries run 8 times over 4 hours, there is no ordering guarantee, and duplicates are possible. A retry that lands after a reinstall would delete the new session if the handler deletes by shop, as the current one does.
4. **Library bug (open upstream, [shopify-app-js#3360](https://github.com/Shopify/shopify-app-js/issues/3360)).** With expiring offline tokens, `authenticate.webhook` tries to refresh an expired stored token before the handler runs. For an uninstalled shop that refresh fails and the library throws a bare `500`. As a result `app/uninstalled`, `shop/redact`, and the `customers/*` topics all 500 on all 8 retries, and the session never gets cleaned up. This affects any merchant who uninstalls more than about an hour after last opening the app, which is the usual case. The starter needs a workaround in its `authenticateWebhook` wrapper.
5. **Compliance webhooks** are declared only in TOML (`compliance_topics`) and can't be created through the Admin API. `authenticate.webhook` checks their HMAC like any other topic and returns 401 on a mismatch, which is what Shopify requires. The handler must return a 2xx within 5 s and finish the action within 30 days.

---

## 1. When does `hooks.afterAuth` fire?

### Call path

- `authenticate.admin` loads the stored session by id. With `useOnlineTokens` off, the id is the offline id `offline_<shop>` (`RR/authenticate/admin/authenticate.mjs:93-103`, `:134-136`). It then hands off to the token-exchange strategy.
- `RR/authenticate/admin/strategies/token-exchange.mjs:56-57` exchanges a token **only if** the stored session is missing or `!session.isActive(undefined, WITHIN_MILLISECONDS_OF_EXPIRY)`:
  ```js
  if (!session ||
      !session.isActive(undefined, WITHIN_MILLISECONDS_OF_EXPIRY)) {
  ```
  - `WITHIN_MILLISECONDS_OF_EXPIRY = 5 * 60 * 1000` (`RR/helpers/ensure-offline-token-is-not-expired.mjs:5`).
  - `isActive(scopes, ms)` checks three things: the access token exists, it is not expired within `ms`, and the scopes are unchanged. Scopes are passed as `undefined`, so a **scope change never triggers a re-exchange** (`API/session/session.mjs:184-213`).
- Inside that branch the strategy exchanges for an offline token and stores it **before** the hook runs (`token-exchange.mjs:60-66`). It also fetches an online token if `useOnlineTokens` is set (`:68-78`). Then it calls `handleAfterAuthHook` (`:83-84`).
- `handleAfterAuthHook` wraps `triggerAfterAuthHook` in `config.idempotentPromiseHandler.handlePromise({ identifier: sessionToken })` (`token-exchange.mjs:41-51`). `triggerAfterAuthHook` calls `config.hooks.afterAuth({ session, admin })` (`RR/authenticate/admin/helpers/trigger-after-auth-hook.mjs:3-13`).
- When the stored session is active, the strategy returns it as-is (`token-exchange.mjs:97`). There is no exchange and no hook.

### There is no refresh-token path in `authenticate.admin`

`ensureOfflineTokenIsNotExpired` is the only caller of `api.auth.refreshToken` (`RR/helpers/ensure-offline-token-is-not-expired.mjs:6-17`). It is reached only through `ensureValidOfflineSession` (`RR/helpers/ensure-valid-offline-session.mjs:4-9`), which these surfaces use:

- `authenticate.webhook`, `.flow`, `.fulfillmentService`, `.public.appProxy`
- `unauthenticated.admin`, `unauthenticated.storefront`

`authenticate.admin` does not use it. In an embedded request the admin path **re-runs token exchange** instead. Shopify's own guidance says the same thing: "When a token expires during an active merchant session … acquire a new token instead of refreshing one. Re-run token exchange" ([Access tokens, Token refresh](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)). The refresh path never calls `afterAuth`.

### When `afterAuth` fires (offline tokens, this repo's config)

| Situation | Fires? | Why |
| - | - | - |
| First install (first app open after managed install) | Yes | No stored session |
| Reinstall, if `app/uninstalled` deleted the session | Yes | No stored session |
| Reinstall, if the session survived (uninstall webhook lost) and its token has expired | Yes | Session not active |
| Reinstall within about 1 h of uninstall, if the session survived | **Not immediately** | The stale session still looks active locally. The first Admin API call returns 401. `handleClientError` clears `accessToken` (`token-exchange.mjs:99-114`, `RR/authenticate/helpers/invalidate-access-token.mjs:1-8`) and asks App Bridge to retry. The retry exchanges and fires the hook. |
| Admin request when the offline token is within 5 min of expiry (expiring tokens are 1 h, `expires_in=3600`) | **Yes, about hourly per active shop** | Session not active, so the strategy re-exchanges |
| Any Admin API 401 in an admin request | Yes, on the retried request | Access token invalidated |
| Offline token refreshed with the refresh token (webhooks, `unauthenticated.admin`) | **No** | Different code path, no hook |
| Online token exchange | Only if `useOnlineTokens: true`. Then the hook gets the online session, and the trigger is the same "stored session not active" check against the online session id | Off in this repo |
| Scope change (managed install re-consent) | No | `isActive(undefined, …)` ignores scopes. See also [shopify-app-js#1204](https://github.com/Shopify/shopify-app-js/issues/1204) |

### Hook caveats that matter for writing the Shop row

- **The session is stored before `afterAuth` runs, and a failing hook is not retried for about an hour.** If the hook throws, the request returns 500 (`token-exchange.mjs:85-94`). The session is already active by then (`:66`), so the next request skips the exchange, and the hook does not run again until the next re-exchange. Anything written only in `afterAuth` can be missing for up to an hour.
- **Dedup is per isolate, in memory, and does not wait.** `IdempotentPromiseHandler` keeps a `Map` of identifiers with a 60 s TTL (`RR/authenticate/helpers/idempotent-promise-handler.mjs:1-31`). The map is created once per `shopifyApp()` call (`RR/shopify-app.mjs:147`). A second caller with the same session token gets an already-resolved promise and **does not wait** for the first caller's hook. On Workers, other isolates do not share the map at all. Concurrent loaders can therefore run before the hook finishes, which is the problem described in [shopify-app-js#1057](https://github.com/Shopify/shopify-app-js/issues/1057), and the hook can run more than once. **`afterAuth` must be idempotent, and loaders must not assume its writes exist.**
- Concurrent cold requests each exchange a token. Shopify retires every other refresh token when a new token is acquired by exchange ("Token exchange and the authorization code grant retire every other refresh token for the app on the store right away"), and it warns: "Don't do the two at the same time for the same store" ([Access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)). The library does nothing to coordinate this. The last session stored wins, and in rare cases its refresh token is already retired. Only the webhook and background paths see the failure, and the next admin re-exchange fixes it.
- Minor: v3.0.0 through v3.0.2 contain a stray `console.log('config.future.expiringOfflineAccessTokens', …)` that runs on every token exchange (`token-exchange.mjs:16`, `src/…/token-exchange.ts:45`). It goes around the repo's logger and its redaction.

## 2. Telling a reinstall from a first install

What the platform offers:

- **No install webhook, and the hook gets no reason.** The managed-installation docs describe install as "merchant approves scopes, then the app exchanges an ID token". They do not mention any install notification ([App installation / CLI app authentication](https://shopify.dev/docs/apps/build/authentication-authorization/cli-app-authentication)). `afterAuth` receives only `{ session, admin }` (`node_modules/@shopify/shopify-app-react-router/dist/ts/server/config-types.d.ts:294-299`).
- **Uninstall revokes the tokens.** "A merchant uninstalling your app … ends all of a token's access. Requests then return `401`, and your app re-authenticates the next time a merchant opens it" ([Access tokens, Token revocation](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)). A reinstall therefore always starts with a new token exchange, but not always right away (see the 1 h row above).

The starter has to infer the lifecycle from its own data. Recommended model, with Shop as the tenant that "outlives uninstall" (map #3):

- `shop` row keyed by the myshopify domain, with `installedAt` and `uninstalledAt` (null while installed). Optionally add `firstInstalledAt` and a `reinstallCount`/`installCount`.
- Classification when the app gets an authenticated admin request for a shop:
  - **No row** → **install**. Insert it with `installedAt = firstInstalledAt = now`.
  - **Row with `uninstalledAt` set** → **reinstall**. Set `installedAt = now` and `uninstalledAt = null`.
  - **Row with `uninstalledAt` null** → neither. This is a token re-acquisition (hourly re-exchange, 401 recovery). At most, refresh the cached shop fields.
- **Where to run it.** Because of the two hook caveats above (failures are not retried, and dedup doesn't wait), the more robust place is the repo's own `authenticateAdmin` wrapper in `app/shopify.server.ts`, run on every admin request:
  1. Read the row (one D1 read).
  2. Upsert only when the row is missing or marked uninstalled.

  This heals itself when a write fails, and loaders always see the row. `afterAuth` is still useful for occasional heavy work, such as syncing shop fields through the Admin API after each exchange. That work must be idempotent, and it is cheap to repeat hourly. Either way, use one `INSERT … ON CONFLICT(domain) DO UPDATE` so concurrent first requests don't race.
- **Known blind spot.** If an `app/uninstalled` delivery is lost (all 8 retries fail, or the library bug below), `uninstalledAt` is never set, and the reinstall is classified as a re-acquisition. Fixing the bug (section 3) closes most of this gap.
- **Unverified idea for a second signal:** store `currentAppInstallation { id }` (the [`AppInstallation`](https://shopify.dev/docs/api/admin-graphql/latest/objects/AppInstallation) gid) on the Shop, and treat a changed id as a reinstall. The docs don't say whether the gid changes on reinstall. Test it on a dev store before relying on it.

## 3. `app/uninstalled`: delivery, ordering, retries, late arrivals

### What Shopify guarantees

- **Retries.** "If Shopify receives no response or an error, it retries 8 times over the next 4 hours." Anything outside 2xx counts as a failure, including 3xx. There is a 1 s connection timeout and a **5 s** timeout for the whole request ([Verify deliveries, HTTPS delivery considerations](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)). "Each time a delivery fails, the interval before the next retry increases" ([Troubleshoot webhooks](https://shopify.dev/docs/apps/build/webhooks/troubleshoot)).
  - After 8 consecutive failures, the docs say a subscription "is automatically deleted if it was configured using the Admin API". By implication, TOML (app-specific) subscriptions are kept ([Verify deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)).
  - Once the retries run out, that delivery is gone for good.
- **Duplicates.** "Shopify minimizes duplicate deliveries, but your app might receive the same webhook more than once". Make handlers idempotent, or deduplicate on `X-Shopify-Webhook-Id`. `X-Shopify-Event-Id` is shared by all deliveries that come from the same merchant action ([Verify deliveries, Ignoring duplicates](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)).
- **Ordering.** "Shopify doesn't guarantee ordering within a topic, or across different topics for the same resource". Use `X-Shopify-Triggered-At` or payload timestamps to order events ([Webhooks overview, Ordering event data](https://shopify.dev/docs/apps/build/webhooks)). The header is described as the "Timestamp of when Shopify triggered the delivery" ([Delivery structure, Headers](https://shopify.dev/docs/apps/build/webhooks/delivery-structure)). **The docs don't say whether it stays the same across retries.**
- **Payload.** The `app/uninstalled` payload is the REST **Shop** resource (`id`, `name`, `email`, `plan_name`, `currency`, `iana_timezone`, …) ([Webhooks reference, app/uninstalled sample](https://shopify.dev/docs/api/webhooks/latest)). It can be used to update the Shop row one last time.
- **Store closure.** Shopify uninstalls apps automatically. `app/uninstalled` fires when the closure takes effect, and `shop/redact` follows 48 h later. The uninstall reason (`scheduled_cancellation`) is not in the payload. Source: Shopify staff on [community.shopify.dev](https://community.shopify.dev/t/new-uninstall-reason-scheduled-cancellation/33033), so lower trust than the docs.

### What the library does: the expired-token 500 loop (bug)

`authenticate.webhook` (`RR/authenticate/webhooks/authenticate.mjs`):

- Rejects non-POST with **405** (`:11-17`).
- Checks the HMAC and the required headers through `api.webhooks.validate`. A bad HMAC returns **401**, missing headers return **400** (`:18-35`).
- **Then** calls `ensureValidOfflineSession(params, check.domain)` (`:36`).

That helper loads `offline_<shop>`. If `expiringOfflineAccessTokens` is on, the token is within 5 min of expiry, and a `refreshToken` is stored, it calls `api.auth.refreshToken` (`RR/helpers/ensure-offline-token-is-not-expired.mjs:8-14`). Refresh fails for an uninstalled shop because its tokens are revoked. `RR/helpers/refresh-token.mjs:12-22` then rethrows `InvalidJwtError` or a 400 `invalid_subject_token`, and turns **any other error into `throw new Response(undefined, { status: 500 })`**. The route handler never runs.

Consequences, confirmed in production by several reports on the open issue [shopify-app-js#3360](https://github.com/Shopify/shopify-app-js/issues/3360) (still present in 3.0.2):

- Every `app/uninstalled` from a shop whose last admin visit was more than about 1 h earlier returns 500 on all 8 attempts. The session row is never deleted, and the Shop is never marked uninstalled.
- `shop/redact` 48 h later and any `customers/*` delivery for that shop hit the same 500. This **fails compliance**, and App Store review has caught it.
- React Router does not log thrown Responses, so the only sign is 500s in the Partner Dashboard.
- If there is no stored session, the refresh is skipped and the webhook succeeds with `session: undefined` (`RR/helpers/create-or-load-offline-session.mjs:11-14`, `authenticate.mjs:68-69`). Deleting the orphan row by hand breaks the loop.

### The late-delivery hazard

A retry of `app/uninstalled` (failed for any reason, including the bug above) can succeed **after** the merchant reinstalls. The reinstall stores a fresh session, so on the retry `authenticate.webhook` finds a valid session and the handler runs. Today's handler (`app/routes/webhooks.app.uninstalled.tsx`) then runs `db.delete(sessionTable).where(eq(sessionTable.shop, shop))`, which **deletes the fresh install's session**. A future Shop handler would likewise set `uninstalledAt` on a shop that is installed.

### Recommendations

1. **Work around the 500 in the existing `authenticateWebhook` wrapper** (`app/shopify.server.ts`).
   - Before calling `shopify.authenticate.webhook`, take `request.clone()`.
   - If it throws a `Response` with `status >= 500`, the HMAC has already passed, because that 500 can only be thrown after validation. Even so, re-verify the HMAC yourself (WebCrypto HMAC-SHA256 of the raw body with `SHOPIFY_API_SECRET`, compared to `X-Shopify-Hmac-Sha256`) and return a context without a session: `shop`, `topic` (normalized like the library does, `topic.toUpperCase().replace(/\/|\./g, '_')`, see `API/webhooks/registry.mjs:8-10`), `webhookId`, `triggeredAt`, `payload`, and `session: undefined`. A 500 alone does not prove the request is genuine.
   - Let 400, 401, and 405 through unchanged.
   - Every handler already has to cope with `session: undefined`.
   - Remove the workaround once upstream fixes #3360.
   - This approach was proposed in comments on #3360. An alternative from the same thread: for post-uninstall topics only, null the stored `refreshToken` and re-run `authenticate.webhook` on a clone.
2. **Make the uninstall handler idempotent and guard it against stale deliveries.**
   - When `session` is present, probe the Admin API with it (for example `{ shop { id } }`).
     - **Success** means the app is installed, so this is a stale delivery from before a reinstall. Log it and return 200 with no changes.
     - **401** means a genuine uninstall.
     - This check is authoritative and doesn't depend on timestamps.
   - When `session` is absent, or as a cheap first check, compare `triggeredAt` with `shop.installedAt`. Ignore the delivery if `triggeredAt < installedAt`. Treat this check as best effort, because the docs don't say whether `triggeredAt` stays the same across retries.
   - For a genuine uninstall:
     - Set `uninstalledAt = triggeredAt ?? now` only if it is still null, so duplicate deliveries change nothing.
     - Update the cached shop fields from the payload.
     - Delete the sessions.
3. Always return 2xx quickly (5 s limit). Handlers run inline (per the map), and a D1 write plus one Admin API probe fits easily.
4. Don't use `X-Shopify-Webhook-Id` dedupe for `app/uninstalled`. The idempotent update above is enough. Do store `webhookId` on `gdpr_request` rows (section 4).

## 4. Compliance webhooks

### Declaration

- Compliance webhooks are configured only in `shopify.app.toml` or the Dev Dashboard. They "**Cannot** be subscribed to using the Admin API" ([Subscribe, comparison table](https://shopify.dev/docs/apps/build/webhooks/subscribe)).
- Field: `compliance_topics`. Valid values are `customers/redact`, `customers/data_request`, and `shop/redact`. Required for apps distributed on the App Store ([App configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration), [Subscribe, subscription fields](https://shopify.dev/docs/apps/build/webhooks/subscribe)).
- `uri` may be relative to `application_url`. The docs recommend this for `shopify app dev` because the tunnel URL changes ([Verify deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)).
- The repo has `[webhooks] api_version = "2026-10"` and **no subscriptions at all** today. Example:

  ```toml
  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks/app/uninstalled"

  [[webhooks.subscriptions]]
  topics = ["app/scopes_update"]
  uri = "/webhooks/app/scopes_update"

  [[webhooks.subscriptions]]
  compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
  uri = "/webhooks/compliance"   # or one subscription and route per topic
  ```

### Verification by `authenticate.webhook`

The library treats compliance topics like any other topic: it checks the HMAC over the raw body and the required headers (`API/webhooks/validate.mjs:20-38`, `:53-86`). The topic comes back normalized:

- `CUSTOMERS_DATA_REQUEST`
- `CUSTOMERS_REDACT`
- `SHOP_REDACT`

An invalid HMAC throws a **401** Response (`RR/authenticate/webhooks/authenticate.mjs:24-30`). That meets the requirement: "If a mandatory compliance webhook sends a request with an invalid Shopify `HMAC` header, then the app must return a `401 Unauthorized`" ([Privacy law compliance, How it works](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)).

Caveat: the expired-token 500 described in section 3 also hits compliance topics. `shop/redact` always arrives after an uninstall, so it is the most likely to hit it, and the workaround applies to these topics too.

### Payloads and timing

All quotes in this subsection are from [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

- **`customers/data_request`.** Sent when a customer asks the merchant for their data, and only to apps "granted access to customer or order data". This repo has only `read_products`, so it is unlikely to receive one. Payload:
  ```json
  { "shop_id": 954889, "shop_domain": "{shop}.myshopify.com",
    "orders_requested": [299938, 280263, 220458],
    "customer": { "id": 191167, "email": "john@example.com", "phone": "555-625-1199" },
    "data_request": { "id": 9999 } }
  ```
- **`customers/redact`.** Sent 10 days after the request if the customer has no orders in the past 6 months; otherwise it is held until 6 months have passed. Also gated on customer or order access. Payload:
  ```json
  { "shop_id": 954889, "shop_domain": "{shop}.myshopify.com",
    "customer": { "id": 191167, "email": "john@example.com", "phone": "555-625-1199" },
    "orders_to_redact": [299938, 280263, 220458] }
  ```
- **`shop/redact`.** Sent "48 hours after a store owner uninstalls your app" so the app can "erase data for that store". Payload:
  ```json
  { "shop_id": 954889, "shop_domain": "{shop}.myshopify.com" }
  ```
- **Response.** Return a 2xx to confirm receipt and "complete the action within 30 days". If the law requires keeping the data, "you shouldn't complete the action". The endpoint must accept `POST` with a JSON body. The general webhook rules from section 3 also apply: 5 s timeout, 8 retries over 4 h.
- **Not documented:** whether a reinstall within 48 h cancels `shop/redact`. A community forum answer says it usually does, but that is unverified. **Guard for it:** on `shop/redact`, redact only if the Shop is still uninstalled (`uninstalledAt` set and not cleared by a reinstall). Otherwise record the request as skipped or superseded. Persist every request to `gdpr_request` before acting, storing the topic, shop, `webhookId`, `triggeredAt`, the payload, and a processed or skipped status. That gives an audit trail, and deduping on `webhookId` makes retries harmless.

## Implications for other tickets on map #3

- **Identity and install-state design.** Use `installedAt`, `uninstalledAt`, and optionally `firstInstalledAt` and an install counter. The "Shop outlives uninstall" rule is what makes reinstall detection possible. Expect `afterAuth` to fire about hourly per active shop, not once per install.
- **When the Shop row is written.** Write it in the `authenticateAdmin` wrapper (read, then upsert when missing or uninstalled), not only in `afterAuth`. A failed `afterAuth` leaves the row missing for up to an hour, and concurrent loaders don't wait for the hook. Also write it from `app/uninstalled` (with the guard), and from `shop/update` if the starter subscribes to it.
- **Webhook auth hardening is a prerequisite.** Without the workaround for upstream #3360, `app/uninstalled` and `shop/redact` fail for most real uninstalls. Add it to the spec and the test plan. Test with an expired stored session, a stale `app/uninstalled` after a reinstall, and duplicate deliveries.
- **Existing route bug.** `webhooks.app.uninstalled.tsx` deletes sessions by shop without any staleness check. Fix it alongside the Shop work.

## Sources

Primary documentation (shopify.dev, fetched 2026-10-11 as `.md`):

- Access tokens (lifetimes, rotation, revocation, token exchange): https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens
- App installation / CLI app authentication: https://shopify.dev/docs/apps/build/authentication-authorization/cli-app-authentication
- Webhooks overview (ordering, reconciliation): https://shopify.dev/docs/apps/build/webhooks
- Verify deliveries (duplicates, timeouts, retries): https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
- Delivery structure (headers): https://shopify.dev/docs/apps/build/webhooks/delivery-structure
- Troubleshoot webhooks: https://shopify.dev/docs/apps/build/webhooks/troubleshoot
- Subscribe (app-specific subscriptions, `compliance_topics`): https://shopify.dev/docs/apps/build/webhooks/subscribe
- App configuration TOML: https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration
- Privacy law compliance: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
- Webhooks reference (`app/uninstalled` payload): https://shopify.dev/docs/api/webhooks/latest
- `AppInstallation`: https://shopify.dev/docs/api/admin-graphql/latest/objects/AppInstallation

Source code:

- `@shopify/shopify-app-react-router@3.0.0` and `@shopify/shopify-api@15.0.0` in `node_modules`, at the paths cited inline.

Upstream issues (secondary, but they reproduce the source reading):

- Shopify/shopify-app-js#3360, #1057, #1204, #3400

Lower trust:

- community.shopify.dev thread on `scheduled_cancellation`
- community.shopify.com thread on `shop/redact` after reinstall (unverified claim, not relied on)
