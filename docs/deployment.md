# Deployment

The app deploys to Cloudflare Workers. There are two environments, each with its own wrangler
config file, Worker name, D1 database, and vars — [`wrangler.staging.jsonc`](../wrangler.staging.jsonc)
and [`wrangler.production.jsonc`](../wrangler.production.jsonc). (The root
[`wrangler.jsonc`](../wrangler.jsonc) is a separate, local-dev-only config used by `pnpm dev` —
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
in each wrangler file. `SHOPIFY_API_SECRET` is the only value set out-of-band, since it's a real
secret (it signs/verifies webhook HMACs and OAuth callbacks). Each deployed file lists it under
`secrets.required`, so `wrangler deploy` fails while it is unset. Production also has optional
`POSTHOG_API_HOST` and `POSTHOG_PROJECT_API_KEY` vars; leave them blank to keep PostHog off. To
add a new variable or secret, see
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

Staging and production run only as deployed Workers. Day-to-day local development is `pnpm dev`,
against the root `wrangler.jsonc`.
