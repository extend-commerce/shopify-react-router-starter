# Database

This document provides an overview of the database used in the Shopify React Router Starter.

The app persists its session and Shop data on [Cloudflare D1](https://developers.cloudflare.com/d1/)
(SQLite) via [Drizzle ORM](https://orm.drizzle.team/). There's no standalone database server or
connection string — the D1 database is a binding (`DB`) configured per environment in a wrangler
config file (see [deployment.md](./deployment.md)).

## Database Schema

The database schema is defined in the `app/db/schema.ts` file.

| Table     | Holds                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| `session` | OAuth credentials, managed by the Shopify session-storage adapter. Don't edit. |
| `shop`    | The merchant tenant's metadata, one row per Shop.                             |

### Shop vs. Session

A Shop is the merchant tenant; a Session holds its credentials. Keep them apart: Shop metadata
survives an uninstall, Sessions do not need to.

- **No foreign keys or Drizzle relations.** `session.shop` and `shop.myshopifyDomain` hold the same
  `*.myshopify.com` domain, and queries join on that value.
- **`shop.id`** is the numeric Shopify Shop ID, parsed from the Admin GraphQL GID. It is always
  supplied by the app, never generated, and is the upsert conflict target.
- **`shop.myshopifyDomain`** is unique and is the lookup key for every data-access function
  (`getShop`, `ensureShop`), so callers never handle the numeric ID.
- **Metadata** (`name`, `email`, `contactEmail`, `shopOwnerName`, `primaryDomain`, `countryCode`,
  `shopifyPlan`, `shopifyPlus`, `partnerDevelopment`) is a snapshot of the Admin GraphQL `shop`
  query. `shopifyPlan` is the merchant's Shopify Plan, not an app billing plan. Code-like values
  are plain text, not enums.
- **Timestamps** (`installedAt`, `uninstalledAt`, `createdAt`, `updatedAt`) are Drizzle
  `timestamp_ms` integers (milliseconds since the epoch, `Date` in TypeScript); booleans are
  integers in boolean mode. A null `uninstalledAt` means installed, so there is no status column.

### Install and reinstall

Persistence functions live in `app/server/shop.server.ts`, take the database handle (`Database`
from `app/db.server.ts`) as their first argument and are documented in JSDoc; they don't log.

- A **first visit** (or the first one after adopting this table: there is no backfill) inserts the
  Shop from a fresh Admin GraphQL snapshot, setting `createdAt` and `installedAt` to now.
- A **Reinstall** (an admin visit to an uninstalled Shop) refreshes the metadata, clears
  `uninstalledAt`, advances `installedAt` and keeps `createdAt`.
- An **installed Shop** costs one indexed lookup per admin request and no further GraphQL call.
- Two requests initializing the same Shop at once are fine: the upsert refreshes metadata but only
  moves `installedAt` while the stored row is still uninstalled.

### Authenticated admin requests always have a Shop

Only the admin authentication wrapper in `app/shopify.server.ts` creates or reinstalls a Shop. After
the library authenticates, it ensures the installed Shop row exists and returns it as `shop`. A
failed snapshot or write fails the request, so a loader or action never sees a missing Shop. See
[development-practices.md](./development-practices.md#authenticating-admin-requests).

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
