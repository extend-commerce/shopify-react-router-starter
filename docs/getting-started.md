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

   The app uses a PostgreSQL database, which can be run locally using Docker.

   ```bash
   docker-compose -f docker-compose.local.yml up -d
   ```

   This will start a PostgreSQL container and expose it on port 5432.

5. **Run database migrations:**

   ```bash
   pnpm run setup
   ```

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
