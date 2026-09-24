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
pnpm run setup
```

This runs `drizzle-kit generate`, creating a new SQL file in the `drizzle` directory.

### Running Migrations

Apply pending migrations with `wrangler d1 migrations apply`, targeting the D1 database bound by
whichever wrangler config you're working against:

```bash
# Local D1 (root wrangler.jsonc, used by `pnpm start`)
pnpm run db:migrate                  # also run automatically by `pnpm run dev`

# Staging / production — see deployment.md
pnpm run db:migrate:staging          # local D1 against the staging config
pnpm run db:migrate:staging:remote   # the real staging database
pnpm run db:migrate:production       # local D1 against the production config
pnpm run db:migrate:production:remote # the real production database
```

## Browsing the Local Database

```bash
pnpm run db:studio
```

This opens [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) against the local D1
database that `pnpm run db:migrate` (or `pnpm run dev`) creates under `.wrangler/state`. Run a
migration first if it reports a missing `url`. It only connects to the local database, never the
staging or production ones.
