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
wrangler d1 migrations apply DB --local

# Staging / production — see deployment.md
pnpm run db:migrate:staging          # local D1 against the staging config
pnpm run db:migrate:staging:remote   # the real staging database
pnpm run db:migrate:production       # local D1 against the production config
pnpm run db:migrate:production:remote # the real production database
```
