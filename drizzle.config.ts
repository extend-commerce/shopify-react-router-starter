import { defineConfig } from 'drizzle-kit';

// Only used by `drizzle-kit generate`, which needs no database connection. Migrations are
// applied with wrangler, and the local database is browsed with Cloudflare's Local Explorer
// (`pnpm explorer`).
export default defineConfig({
  dialect: 'sqlite',
  schema: './app/db/schema.ts',
  out: './drizzle',
});
