# Deployment

The app deploys to Cloudflare Workers. There are two environments, each with its own wrangler
config file, Worker name, D1 database, and vars — [`wrangler.staging.jsonc`](../wrangler.staging.jsonc)
and [`wrangler.production.jsonc`](../wrangler.production.jsonc). (The root
[`wrangler.jsonc`](../wrangler.jsonc) is a separate, local-dev-only config used by `pnpm start` —
it's never deployed.)

## One-time environment setup

Each environment needs its own D1 database and its own copy of the `SHOPIFY_API_SECRET` secret
before its first deploy:

```bash
# Staging
wrangler d1 create shopify-react-router-starter-staging
# paste the returned database_id into wrangler.staging.jsonc's d1_databases entry
wrangler secret put SHOPIFY_API_SECRET --config wrangler.staging.jsonc

# Production
wrangler d1 create shopify-react-router-starter-production
# paste the returned database_id into wrangler.production.jsonc's d1_databases entry
wrangler secret put SHOPIFY_API_SECRET --config wrangler.production.jsonc
```

`SHOPIFY_API_KEY`, `SCOPES`, `SHOPIFY_APP_URL`, and `NODE_ENV` are plain `vars` already committed
in each wrangler file — `SHOPIFY_API_SECRET` is the only value that has to be set out-of-band,
since it's a real secret (it signs/verifies webhook HMACs and OAuth callbacks). To add a new
variable or secret to these environments, see
[environment-variables.md](./environment-variables.md#staging-and-production).

Once a custom domain is decided for an environment, uncomment and fill in that file's `routes`
block and update its `SHOPIFY_APP_URL` var to match (both files deploy to their `*.workers.dev`
subdomain until then).

## Deploying

```bash
pnpm run deploy:staging      # builds, then wrangler deploy --config wrangler.staging.jsonc
pnpm run deploy:production   # builds, then wrangler deploy --config wrangler.production.jsonc
```

Each applies pending D1 migrations to the target environment's **remote** database separately —
deploying the Worker doesn't run migrations automatically:

```bash
pnpm run db:migrate:staging:remote
pnpm run db:migrate:production:remote
```

## Local verification against a deployed-shaped config

To exercise the staging wrangler config locally (real `wrangler dev`, local D1, no network calls
to the real staging database):

```bash
pnpm run db:migrate:staging    # applies migrations to a local D1 instance
pnpm run dev:staging           # builds, then wrangler dev --config wrangler.staging.jsonc
```

This is distinct from `pnpm start` (day-to-day local development against the root
`wrangler.jsonc`, with Vite's HMR) — use `dev:staging` when you specifically want to check the
staging config's bindings/vars against a real (local) Workers runtime before deploying.
