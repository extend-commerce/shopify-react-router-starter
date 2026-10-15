# Environment Variables

The app runs inside the Cloudflare Workers runtime (workerd), both locally and when deployed. A
Worker does not inherit its environment from the shell that started it. Where a variable lives
depends on which runtime is reading it.

There are two runtimes. Local dev is `pnpm dev`. Staging and production exist only as deploys
(`pnpm run deploy:staging` / `pnpm run deploy:production`). They are never started on your machine.

| Runtime              | Where values come from                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| Local (`pnpm dev`)   | The Shopify CLI, plus the allowlist in the root [`wrangler.jsonc`](../wrangler.jsonc) |
| Staging / production | `vars` in `wrangler.<env>.jsonc`, and secrets set with `wrangler secret put`          |

[`env.d.ts`](../env.d.ts) is the typed list of every key the Worker reads. `.env` is optional and
local-only. Nothing in it is uploaded, and a newcomer does not need one to run `pnpm dev`.

## What the Worker reads

| Key                                           | Local dev                                                     | Deployed                                                  |
| --------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `SHOPIFY_API_KEY`                             | Shopify CLI, required                                         | plain `var` in both wrangler files (the app's client id)  |
| `SHOPIFY_API_SECRET`                          | Shopify CLI, required                                         | `wrangler secret put`, required at deploy                 |
| `SCOPES`                                      | Shopify CLI, required                                         | plain `var` in both wrangler files                        |
| `SHOPIFY_APP_URL`                             | mapped from `HOST` or `APP_URL` in `vite.config.ts`, required | plain `var` in both wrangler files                        |
| `NODE_ENV`                                    | unset on the Worker                                           | plain `var`: `staging` or `production`                    |
| `POSTHOG_API_HOST`, `POSTHOG_PROJECT_API_KEY` | unset                                                         | optional plain `vars` on production only; blank means off |

`SHOPIFY_API_KEY` in each deployed file is that environment's app client id:
`shopify.app.staging.toml` for staging and `shopify.app.toml` for production. It is a public id
(App Bridge sends it to the browser), so it is a `var`, not a secret.
`SHOPIFY_API_SECRET` signs webhook HMACs and OAuth callbacks, so it is never committed.

## Local development

`pnpm dev` runs the Shopify CLI, which injects `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and
`SCOPES` into the Node process. The CLI does not set `SHOPIFY_APP_URL`. It sets `HOST` and
`APP_URL`, and `vite.config.ts` copies the first of those that is set onto `SHOPIFY_APP_URL`
before the Worker starts.

The root `wrangler.jsonc` lists those four names under `secrets.required`. That allowlist is the
only shell environment copied into the Worker. A truthy value already in the shell wins over the
same key in `.env`.

> [!WARNING]
> **Don't create a `.dev.vars` file.** When `.dev.vars` exists, wrangler loads it exclusively and
> ignores both `.env` and the CLI. `pnpm dev` exits immediately if `.dev.vars` or `.dev.vars.*`
> is present. Move any values into `.env` and delete the file.

`.env` and `.env.local` are gitignored. Use them only for a local override of an allowlisted key.
You do not need them for Shopify credentials.

## Adding a new variable

1. **Declare its type** in [`env.d.ts`](../env.d.ts) under `ProcessEnv`.
2. **Decide where it lives.** A local-only value goes on the root `wrangler.jsonc` allowlist
   (`secrets.required`, or a `vars` entry when it has a default). A deployed value goes in the
   wrangler file for each environment that should see it. A key that is in neither place stays
   `undefined` on the Worker, even if your shell has it.
3. **If it is a secret**, do not put it in `vars`. Add the name to `secrets.required` on each
   deployed file that needs it, and set the value with `wrangler secret put` (next section).

## Staging and production

Each environment has its own config file:
[`wrangler.staging.jsonc`](../wrangler.staging.jsonc) and
[`wrangler.production.jsonc`](../wrangler.production.jsonc). The root `wrangler.jsonc` is
local-only and is never deployed.

A value that grants access or signs requests is a secret (the Shopify API secret, private tokens,
signing keys). Public identifiers and plain configuration are `vars` (the client id, scopes, the
app URL, `NODE_ENV`, the PostHog host and project key).

### Plain values: `vars`

Add the key to the `vars` block of each environment that should have it, with that environment's
value. `vars` are committed. `wrangler deploy` replaces the Worker's vars with the file, so a
value edited only in the Cloudflare dashboard is lost on the next deploy.

PostHog is production-only. `POSTHOG_API_HOST` and `POSTHOG_PROJECT_API_KEY` live in
`wrangler.production.jsonc`. Leave either blank and the app skips `posthog.init`. Staging does
not carry the keys; its `NODE_ENV` is `staging`, so the provider stays off there too.

### Secrets: `wrangler secret put`

Secrets are never written into the wrangler files. Set each one once per environment:

```bash
wrangler secret put SHOPIFY_API_SECRET --config wrangler.staging.jsonc
wrangler secret put SHOPIFY_API_SECRET --config wrangler.production.jsonc
```

Wrangler prompts for the value, stores it encrypted, and deploys it without a code deploy.
Secrets persist across later `wrangler deploy`s. The app reads them through `process.env`.

Both deployed files list `SHOPIFY_API_SECRET` under `secrets.required`. `wrangler deploy` fails
while that secret is unset.

```bash
wrangler secret list --config wrangler.staging.jsonc
wrangler secret delete SHOPIFY_API_SECRET --config wrangler.staging.jsonc
```

Document each new secret in the "One-time environment setup" list in
[deployment.md](./deployment.md).
