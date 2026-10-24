# Database

This document provides an overview of the database used in the Shopify React Router Starter.

The app persists its sessions and GDPR requests on [Cloudflare D1](https://developers.cloudflare.com/d1/)
(SQLite) via [Drizzle ORM](https://orm.drizzle.team/). There's no standalone database server or
connection string — the D1 database is a binding (`DB`) configured per environment in a wrangler
config file (see [deployment.md](./deployment.md)).

## Database Schema

The database schema is defined in the `app/db/schema.ts` file. Persistence functions live in
`app/server/*.server.ts` and take the database handle (`Database`, exported from
`app/db.server.ts`) as their first argument.

| Table          | Holds                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| `session`      | OAuth Sessions, read and written by the Shopify session storage adapter. |
| `gdpr_request` | One audit row per mandatory compliance webhook delivery (GDPR Request).   |

### GDPR Request (`gdpr_request`)

A GDPR Request is a persisted mandatory compliance webhook (`customers/data_request`,
`customers/redact`, or `shop/redact`). It is written as `pending` before any work is done, so an
interrupted request stays visible and is retried by Shopify's redelivery. See
[webhooks.md](./webhooks.md) for the flow.

| Column        | Type                    | Notes                                                           |
| ------------- | ----------------------- | --------------------------------------------------------------- |
| `id`          | text, primary key       | `X-Shopify-Webhook-Id` (not the event ID); the dedupe key.       |
| `topic`       | text enum, required     | Wire form: `customers/data_request`, `customers/redact`, `shop/redact`. |
| `shopId`      | integer, required       | Payload `shop_id`; indexed.                                     |
| `shopDomain`  | text, required          | Payload `shop_domain`.                                          |
| `payload`     | JSON text, required     | Payload with `customer.email` and `customer.phone` removed.     |
| `status`      | text enum, required     | `pending` (default), `processed`, or `skipped`.                 |
| `triggeredAt` | millisecond timestamp   | Webhook triggered-at header.                                    |
| `createdAt`   | millisecond timestamp   | When the app received the request.                              |
| `processedAt` | millisecond timestamp   | Null until the request is `processed` or `skipped`.             |

- **Scrub policy:** customer email and phone are removed before the payload is stored. Customer,
  order and data-request IDs are kept so the audit row stays meaningful.
- **Retention:** rows are kept indefinitely as audit evidence. There is no pruning, TTL, or note
  field, and no `updatedAt`.
- **No foreign keys:** a request can arrive for a shop with no matching row elsewhere, and the
  evidence must outlive any later deletion of that shop's data. `shopId` and `shopDomain` are plain
  values that are never joined by constraint.

## Migrations

We use [Drizzle Kit](https://orm.drizzle.team/kit/overview) to generate migration SQL from the
schema, but D1 migrations themselves are applied with `wrangler`, not `drizzle-kit` (`drizzle-kit
migrate` doesn't support D1). Migration files are located in the `drizzle` directory.

### Generating Migrations

After changing `app/db/schema.ts`, generate the corresponding SQL migration with:

```bash
pnpm run db:generate
```

This runs `drizzle-kit generate`, creating a new SQL file in the `drizzle` directory.
Generation is explicit so that interactive rename prompts remain visible and every generated
migration can be reviewed before it is committed.

### Running Migrations

Apply pending migrations with `wrangler d1 migrations apply`, targeting the D1 database bound by
whichever wrangler config you're working against:

```bash
# Local D1 (root wrangler.jsonc)
pnpm run db:migrate                  # also run automatically by `pnpm run dev`

# Remote staging / production — see deployment.md
pnpm run db:migrate:staging:remote   # the real staging database
pnpm run db:migrate:production:remote # the real production database
```

## Browsing the Local Database

Use Cloudflare's built-in
[Local Explorer](https://developers.cloudflare.com/workers/local-development/local-explorer/) to
browse tables, run SQL, and inspect the Worker's bindings. It needs no setup, but only exists while
`pnpm dev` is running. With the dev server up, run:

```bash
pnpm explorer
```

This opens
[`http://localhost:3000/cdn-cgi/local/explorer`](http://localhost:3000/cdn-cgi/local/explorer) in
your browser. The same URL is also printed in the `pnpm dev` output once the server is ready.

Local Explorer only shows the local D1 database that `pnpm run db:migrate` (or `pnpm run dev`)
creates under `.wrangler/state`, never the staging or production ones. It is intentionally not
available through the public Shopify tunnel, only on `localhost`.
