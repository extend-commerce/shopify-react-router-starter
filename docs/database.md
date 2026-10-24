# Database

This document provides an overview of the database used in the Shopify React Router Starter.

The app persists its session data on [Cloudflare D1](https://developers.cloudflare.com/d1/)
(SQLite) via [Drizzle ORM](https://orm.drizzle.team/). There's no standalone database server or
connection string — the D1 database is a binding (`DB`) configured per environment in a wrangler
config file (see [deployment.md](./deployment.md)).

## Database Schema

The database schema is defined in the `app/db/schema.ts` file.

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
