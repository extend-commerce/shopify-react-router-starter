# Development Practices

This document outlines the development practices and conventions that should be followed when working on the Shopify React Router Starter.

## Code Style and Formatting

We use [Prettier](https://prettier.io/) for automatic code formatting. This ensures a consistent code style across the entire codebase.

- **Check for formatting issues:**

  ```bash
  pnpm run format:check
  ```

- **Format the code:**

  ```bash
  pnpm run format
  ```

We recommend setting up your editor to format on save.

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

## Logging

Log through `app/lib/logger`, never `console.*` directly. It is a thin wrapper around [LogTape](https://logtape.org/):

```ts
import logger, { getLogger } from 'app/lib/logger';

logger.info('Received webhook', { topic, shop });
logger.error(error);

const webhookLogger = getLogger(['app', 'webhooks']); // its own category
const shopLogger = logger.with({ shop }); // adds `shop` to every line it logs
```

- **Output:** readable, coloured lines in local dev; one JSON object per line in deployed Workers.
- **Level:** `info` when `NODE_ENV` is `production`, `debug` everywhere else (including staging).
- **Categories:** app code logs under `app`; the Shopify library logs under `shopify`, so either can be filtered out on its own.
- **Request context:** every line logged while handling a request carries `requestId` (Cloudflare's `cf-ray`) and `path`, set in `workers/app.ts`.
- **Shipping logs:** the staging and production Wrangler configs enable [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/). To send logs to an OpenTelemetry backend (Datadog, Grafana, PostHog, a self-hosted collector, …), create a destination in the Cloudflare dashboard and list it under `observability.logs.destinations` ([docs](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)). This needs Workers Paid and OTLP/JSON. If you can't meet those, add the [`@logtape/otel`](https://logtape.org/sinks/otel) sink in `app/lib/logger/config.ts` instead; call sites stay the same.

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages. This helps us maintain a clear and consistent commit history, and allows us to automatically generate changelogs.

To make it easier to follow the specification, we use [Commitizen](http://commitizen.github.io/cz-cli/) to create commit messages.

- **Create a commit:**

  ```bash
  pnpm run commit
  ```

This will launch an interactive prompt that will guide you through creating a compliant commit message.
