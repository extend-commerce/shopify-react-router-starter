# Environment Variables

The app runs inside the Cloudflare Workers runtime (workerd), both locally and when deployed. A
Worker doesn't inherit its environment from the shell that started it. Its `process.env` is built
from wrangler config and local env files, so where a variable lives depends on the environment:

| Environment            | Where values come from                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| Local (`pnpm run dev`) | Shopify CLI + your `.env` / `.env.local`                                  |
| Staging / production   | `vars` in `wrangler.<env>.jsonc` + secrets set with `wrangler secret put` |

## Local development

Put local values in **`.env`** (gitignored). `.env.example` is the committed template. It lists
every variable the app reads, so copy it and fill in your own values:

```bash
cp .env.example .env
```

`.env.local` also works, and its values override `.env`.

When you run `pnpm run dev`, the Shopify CLI injects `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
`SCOPES` and `SHOPIFY_APP_URL` (the tunnel URL, which changes every run). `vite.config.ts` sets
`CLOUDFLARE_INCLUDE_PROCESS_ENV=true` for the dev server (not for builds), so these values are passed through to the Worker together
with everything in `.env`. If a key is in both, the CLI's value wins. You don't need to set these
four keys in `.env` at all.

> [!WARNING]
> **Don't create a `.dev.vars` file.** When `.dev.vars` exists, wrangler loads it _exclusively_
> and ignores both `.env` and the CLI-injected variables. The app then gets a stale or missing
> `SHOPIFY_APP_URL` / `SHOPIFY_API_KEY` and won't load inside the Shopify admin: it either shows a
> blank frame or fails with "Detected an empty appUrl configuration". If you have one, move its
> values into `.env` and delete it.

Locally, the Worker can see your whole shell environment, not only the app's variables. This only
applies to local dev. Deployed Workers receive only what's configured for them (see below).

## Adding a new variable

1. **Declare its type** in [`env.d.ts`](../env.d.ts) under `ProcessEnv`, so `process.env.MY_VAR`
   is typed.
2. **Add it to [`.env.example`](../.env.example)**, with an empty or dummy value, so other
   engineers know it exists. Tell the team when you add one, because their `.env` won't have it
   yet.
3. **Set it in your own `.env`.** Restart `pnpm run dev` to pick it up.
4. **Add it to staging and production** as a plain var or a secret (next section). If you skip
   this, the variable is `undefined` in deployed environments.

## Staging and production

Each environment has its own self-contained config file:
[`wrangler.staging.jsonc`](../wrangler.staging.jsonc) and
[`wrangler.production.jsonc`](../wrangler.production.jsonc). The root `wrangler.jsonc` is
local-only and is never deployed, so don't add deployed values there.

First decide whether the value is a secret. Anything that grants access or signs things is a
secret (API secrets, private tokens, signing keys). Public identifiers and plain configuration
are not (client IDs, public/browser-side keys, hostnames, feature flags).

### Plain (non-secret) values: `vars` in the wrangler file

Add the key to the `vars` block of **both** wrangler files, with each environment's value. For
example:

```jsonc
// wrangler.staging.jsonc
"vars": {
  // ...existing vars
  "POSTHOG_API_HOST": "https://us.i.posthog.com",
},
```

The value ships on the next deploy (`pnpm run deploy:staging` / `pnpm run deploy:production`).
`vars` are committed and visible to anyone with repo or dashboard access, so never put a secret
here.

Keep `vars` in the wrangler files, not in the Cloudflare dashboard. `wrangler deploy` replaces the
Worker's vars with what's in the file, so vars edited in the dashboard are lost on the next
deploy.

### Secrets: `wrangler secret put`

Secrets are never written into the wrangler files. Set each one once per environment:

```bash
wrangler secret put MY_SECRET --config wrangler.staging.jsonc
wrangler secret put MY_SECRET --config wrangler.production.jsonc
```

Wrangler prompts for the value, stores it encrypted, and deploys it right away, without a code
deploy. Secrets persist across later `wrangler deploy`s. The app reads them through
`process.env.MY_SECRET` like any other variable.

Other useful commands:

```bash
wrangler secret list --config wrangler.staging.jsonc
wrangler secret delete MY_SECRET --config wrangler.staging.jsonc
```

Document each new secret in the "One-time environment setup" list in
[deployment.md](./deployment.md), so that anyone setting up a new environment knows to set it.
`SHOPIFY_API_SECRET` is the existing example.

### Checking a deployed-shaped config locally

`pnpm run dev:staging` runs `wrangler dev` against `wrangler.staging.jsonc`. It uses that file's
`vars`, but your local `.env` values are layered on top and win for any key in both. Secrets
aren't pulled from Cloudflare, so provide them in `.env` for these runs.
