# Development Practices

This document outlines the development practices and conventions that should be followed when working on the Shopify React Router Starter.

## Code Style and Formatting

We use [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) for automatic code formatting. This ensures a consistent code style across the entire codebase. It is Prettier-compatible and configured in `.oxfmtrc.json`, which also lists the files it skips (JSON, YAML, TOML, Markdown, GraphQL and generated files).

- **Check for formatting issues:**

  ```bash
  pnpm run format:check
  ```

- **Format the code:**

  ```bash
  pnpm run format
  ```

We recommend setting up your editor to format on save. In VS Code, the recommended [Oxc extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode) is already set as the default formatter in `.vscode/settings.json`.

## Linting

We use [Oxlint](https://oxc.rs/docs/guide/usage/linter/) to identify and report on patterns found in ECMAScript/JavaScript code. The configuration covers the recommended rules from ESLint and TypeScript ESLint, plus React and import checks. Type-aware rules run through `oxlint-tsgolint`.

- **Run the linter:**

  ```bash
  pnpm run lint
  ```

## Type Checking

We use [TypeScript](https://www.typescriptlang.org/) for static type checking. This helps us catch errors early and improve code quality.

- **Run the type checker:**

  ```bash
  pnpm run typecheck
  ```

## Testing

We use [Vitest](https://vitest.dev/) for functional tests. Tests run in Node and sit next to the code they cover, named `*.test.ts`; `app/routes.ts` keeps them out of the route tree.

- **Run the tests:**

  ```bash
  pnpm run test
  ```

- **Run them in watch mode:**

  ```bash
  pnpm run test:watch
  ```

Test loaders, actions, server helpers and plain functions:

- **Loaders and actions:** call them with a `Request` and assert on what they return or throw.
- **Server helpers:** pass them a stubbed `admin` (see `app/server/products.server.test.ts`).
- **Stubs:** build partial objects with [`fromPartial()`](https://github.com/total-typescript/shoehorn) from `@total-typescript/shoehorn` instead of `as` (or `fromAny()` when the data is wrong on purpose).
- **Route modules that import `app/shopify.server`:** add `vi.mock('app/shopify.server')`, since it opens the D1 binding on import.

## Links and Navigation

The app only runs embedded in the Shopify admin, so navigation goes through App Bridge and Polaris web components, as in [Shopify's React Router template](https://github.com/Shopify/shopify-app-template-react-router):

- **App nav:** `<s-app-nav>` in `app/routes/app.tsx`, with one `<s-link>` per page ([docs](https://shopify.dev/docs/api/app-home/app-bridge-web-components/app-nav)). The `/app` link carries `rel="home"`, so the app name in the admin opens `/app` and the link itself stays out of the menu.
- **Links between pages:** `<s-link href="/app/...">`. Polaris turns the click into a `shopify:navigate` event, and `AppProvider` hands that to React Router as a client-side navigation.
- **Never a plain `<a href="/app/...">`.** The browser then loads the page from scratch without the `shop`, `host` and `id_token` params the admin added, so authentication fails and the app shows a blank or bounce page.
- **External links:** `<s-link href="https://..." target="_blank">`.
- **Buttons:** `<s-button onClick={...}>`. Use the `shopify` global (typed by `@shopify/app-bridge-types`) for App Bridge APIs such as toasts and `shopify.intents`.

`app/app-bridge.d.ts` types the App Bridge elements (`s-app-nav`, `ui-modal`, `ui-save-bar`, ...) for React 19, which `@shopify/app-bridge-types` doesn't reach on its own.

## Pinned Versions

- **`react-router`, `@react-router/dev`, `@react-router/fs-routes` at `7.18.2`:** 7.18.3 and later compare the full request origin on actions, which makes every `action` return `400 Bad Request` under `shopify app dev` ([template issue #279](https://github.com/Shopify/shopify-app-template-react-router/issues/279)). This matches Shopify's template. `@shopify/shopify-app-react-router` doesn't support React Router 8 yet either ([shopify-app-js#3319](https://github.com/Shopify/shopify-app-js/issues/3319)).

## Logging

Log through `app/lib/logger`, never `console.*` directly. It is a thin wrapper around [LogTape](https://logtape.org/):

```ts
import logger, { getLogger } from 'app/lib/logger';

logger.info('Loaded products');
logger.error(error);

const webhookLogger = getLogger(['app', 'webhooks']);
webhookLogger.info('Received webhook', { topic });
```

- **Output:** readable, coloured lines in local dev; one JSON object per line in deployed Workers.
- **Level:** the `app` category (including `app.webhooks`) is `info` when `NODE_ENV` is `production` and `debug` everywhere else, staging included. The Shopify library is `debug` in local dev and `info` on staging and production.
- **Categories:** app code logs under `app`; webhook routes log under `app.webhooks`; the Shopify library logs under `shopify`. Each can be filtered on its own.
- **Request context:** every line logged while handling a request carries `requestId` (Cloudflare's `cf-ray`) and `path`, set in `workers/app.ts`. After `authenticate.admin()` or `authenticate.webhook()` returns, lines also carry `shop` (the `*.myshopify.com` domain) and `sessionId` (`offline_<shop>`). A webhook with no session omits `sessionId`. `logger.with()` still adds extra fields to one logger.
- **Shopify debug lines:** `httpRequests` is off, and the log bridge strips `sessionToken` and the decoded `payload` before they are written.
- **Shipping logs:** `wrangler.production.jsonc` enables [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/). To send logs to an OpenTelemetry backend (Datadog, Grafana, PostHog, a self-hosted collector, …), create a destination in the Cloudflare dashboard and list it under `observability.logs.destinations` ([docs](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)). This needs Workers Paid and OTLP/JSON. If you can't meet those, add the [`@logtape/otel`](https://logtape.org/sinks/otel) sink in `app/lib/logger/config.ts` instead; call sites stay the same.

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages. This helps us maintain a clear and consistent commit history, and allows us to automatically generate changelogs.

To make it easier to follow the specification, we use [Commitizen](http://commitizen.github.io/cz-cli/) to create commit messages.

- **Create a commit:**

  ```bash
  pnpm run commit
  ```

This will launch an interactive prompt that will guide you through creating a compliant commit message.
