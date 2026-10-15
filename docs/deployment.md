# Deployment

The app deploys to one Cloudflare Worker, configured in
[`wrangler.production.jsonc`](../wrangler.production.jsonc). Production is the Worker's normal
deployment. Staging is a [Worker Preview](https://developers.cloudflare.com/workers/previews/)
named `staging` on the same Worker, configured by that file's `previews` block and served at
`https://staging-<worker name>.<subdomain>.workers.dev`. (The root
[`wrangler.jsonc`](../wrangler.jsonc) is a separate, local-dev-only config used by `pnpm dev` —
it's never deployed.)

Previews inherit no bindings or vars from production. Staging gets only what `previews`
declares: its own D1 database and the staging Shopify app's client id and URL. It never touches
the production database.

| Environment | Worker deploy                     | D1 database / migrations config                    | Shopify app                |
| ----------- | --------------------------------- | -------------------------------------------------- | -------------------------- |
| Staging     | `wrangler preview --name staging` | `previews.d1_databases` / `wrangler.staging.jsonc` | `shopify.app.staging.toml` |
| Production  | `wrangler deploy`                 | top-level `d1_databases` / same file               | `shopify.app.toml`         |

## One-time environment setup

Each environment needs its own D1 database and its own copy of the `SHOPIFY_API_SECRET` secret
(the secret of that environment's Shopify app) before its first deploy:

```bash
# Staging
wrangler d1 create shopify-react-router-starter-staging
# paste the returned database_id into wrangler.production.jsonc's previews.d1_databases entry
# and into wrangler.staging.jsonc (used only to run staging migrations)
wrangler preview secret put SHOPIFY_API_SECRET --name staging --config wrangler.production.jsonc

# Production
wrangler d1 create shopify-react-router-starter-production
# paste the returned database_id into wrangler.production.jsonc's top-level d1_databases entry
wrangler secret put SHOPIFY_API_SECRET --config wrangler.production.jsonc
```

`SHOPIFY_API_KEY`, `SCOPES`, `SHOPIFY_APP_URL`, and `NODE_ENV` are plain `vars` already committed
in `vars` (production) and `previews.vars` (staging). `SHOPIFY_API_SECRET` is the only value set
out-of-band, since it's a real secret (it signs/verifies webhook HMACs and OAuth callbacks).
Production lists it under `secrets.required`, so `wrangler deploy` fails while it is unset.
Production also has optional `POSTHOG_API_HOST` and `POSTHOG_PROJECT_API_KEY` vars; leave them
blank to keep PostHog off. To add a new variable or secret, see
[environment-variables.md](./environment-variables.md#staging-and-production).

Once a custom domain is decided for production, uncomment and fill in the `routes` block and
update `SHOPIFY_APP_URL` and `shopify.app.toml` to match. Staging stays on its `workers.dev`
Preview URL.

## Deploying

```bash
pnpm run deploy:staging      # builds, then wrangler preview --name staging
pnpm run deploy:production   # builds, then wrangler deploy
```

Each applies pending D1 migrations to the target environment's **remote** database separately —
deploying the Worker doesn't run migrations automatically:

```bash
pnpm run db:migrate:staging:remote
pnpm run db:migrate:production:remote
```

Staging and production run only on Cloudflare. Day-to-day local development is `pnpm dev`,
against the root `wrangler.jsonc`.

## Automated deploys (GitHub Actions)

Branch flow: `feat/*`, `fix/*` and `refactor/*` PRs merge into `dev`; `dev` merges into `main`
through a PR titled `release: vX.Y.Z` (for example `release: v1.2.0`).
[`branch-flow.yml`](../.github/workflows/branch-flow.yml) checks both on every PR, and
[`ci.yml`](../.github/workflows/ci.yml) runs lint, format, typecheck and tests. Both must pass
before a PR can merge into `dev` or `main`.

- **Staging** ([`deploy-staging.yml`](../.github/workflows/deploy-staging.yml)): every push to
  `dev` applies staging D1 migrations, deploys the `staging` Preview, then runs
  `shopify app deploy --config staging`.
- **Production** ([`deploy-production.yml`](../.github/workflows/deploy-production.yml)): merging
  the release PR checks the title's version is new and that the promoted `dev` commit deployed to
  staging successfully. After approval on the `production` environment, it applies production D1
  migrations, deploys the production Worker, runs `shopify app deploy --config shopify.app.toml`,
  then tags the merge commit with the version.

Migrations run before the new Worker is live, so they must work with the version still running.

### One-time GitHub setup

Staging and production are separate Shopify apps: `shopify.app.staging.toml` and
`shopify.app.toml`, each with its matching `SHOPIFY_API_KEY` in `wrangler.production.jsonc`
(`previews.vars` for staging, `vars` for production).

1. Create GitHub environments `staging` and `production`. In each, add:
   - secret `CLOUDFLARE_API_TOKEN`: a Cloudflare token with Workers Scripts and D1 edit access
   - secret `SHOPIFY_APP_AUTOMATION_TOKEN`: an app automation token for that environment's
     Shopify app
   - variable `CLOUDFLARE_ACCOUNT_ID`
2. Add required reviewers to `production`. That approval is the gate before production deploys.
3. Protect `dev` and `main`: require PRs and the `Branch flow`, `Lint`, `Format`, `Typecheck`
   and `Test` checks.

If a production run fails after the Shopify deploy (for example while tagging), tag the merge
commit by hand rather than re-running: re-running would try to create the same Shopify version
again.
