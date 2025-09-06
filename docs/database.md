# Database

This document provides an overview of the database used in the Shopify Remix Starter.

## Database Schema

The database schema is defined in the `app/db/schema.ts` file. We use [Drizzle ORM](https://orm.drizzle.team/) to define the schema and interact with the database.

## Migrations

We use [Drizzle Kit](https://orm.drizzle.team/kit/overview) to manage database migrations. Migration files are located in the `drizzle` directory.

### Generating Migrations

To generate a new migration, run the following command:

```bash
pnpm run drizzle:generate
```

This will create a new SQL file in the `drizzle` directory that contains the necessary SQL statements to update the database schema.

### Running Migrations

To apply the latest migrations to your database, run the following command:

```bash
pnpm run drizzle:migrate
```

This will run all the pending migration files and update the database schema to the latest version.
