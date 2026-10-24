# Webhooks

Webhook subscriptions are declared in the app configuration TOML files
([`shopify.app.toml`](../shopify.app.toml) and
[`shopify.app.staging.toml`](../shopify.app.staging.toml)) and are delivered to one route per
topic in `app/routes`, named `webhooks.<topic>.tsx` (for example
`webhooks.customers.redact.tsx` handles `customers/redact`). Each route calls
`authenticate.webhook(request)` from `app/shopify.server.ts`, which verifies the HMAC and returns
the normalized topic (`CUSTOMERS_REDACT`), the webhook ID, and the payload. Subscriptions take
effect when the app configuration is deployed with `pnpm deploy`.

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
