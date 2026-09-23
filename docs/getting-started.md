# Getting Started

This guide will walk you through setting up and running the Shopify Remix Starter locally.

## Prerequisites

- [Node.js](https://nodejs.org/) (version specified in `.node-version` file)
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/extend-commerce/shopify-remix-starter
   cd shopify-remix-starter
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Set up environment variables:**

   Create a `.env` file in the root of the project and add the necessary environment variables. You can use the `.env.example` file as a template.

4. **Set up the database:**

   The app persists its session data on Cloudflare D1 (SQLite) via Drizzle. Local development runs
   against a local D1 database through `wrangler`/miniflare rather than a standalone database
   server — there's no Docker container or connection string to configure. Migrations live in
   `drizzle/` (generate new ones with `pnpm run setup` after changing `app/db/schema.ts`) and are
   applied to the local D1 database with `wrangler d1 migrations apply <DB_NAME> --local`, using
   the D1 binding configured in the wrangler config.

## Shopify App Configuration

To link your local development environment to a specific app in your Shopify Partner account, use the following command:

```bash
pnpm run config:link
```

This will prompt you to select your Shopify organization and the app you want to link to.

## Running the App

To run the app in development mode, use the Shopify CLI:

```bash
pnpm run dev
```

This will start the development server and connect to your Shopify development store.
