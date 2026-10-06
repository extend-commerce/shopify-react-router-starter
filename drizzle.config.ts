import { defineConfig } from 'drizzle-kit';
import fs from 'node:fs';
import path from 'node:path';

const isSqliteDB = (name: string) => {
  return name.endsWith('.sqlite') && name !== 'metadata.sqlite';
};

// Miniflare stores the local D1 database (created by `pnpm run db:migrate`) under a hashed
// filename, so it's looked up rather than hard-coded. Only `drizzle-kit studio` needs it —
// `generate` works without credentials, and migrations are applied with wrangler, not drizzle-kit.
function getLocalD1Path() {
  const dir = path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

  if (!fs.existsSync(dir)) {
    return undefined;
  }

  const files = fs.readdirSync(dir).filter(isSqliteDB);
  if (files.length > 1) {
    throw new Error(
      `Found multiple local D1 databases in ${dir}. Remove stale .sqlite files before running db:studio.`,
    );
  }

  return files[0] ? path.join(dir, files[0]) : undefined;
}

const localD1Path = getLocalD1Path();

export default defineConfig({
  dialect: 'sqlite',
  schema: './app/db/schema.ts',
  out: './drizzle',
  ...(localD1Path && { dbCredentials: { url: localD1Path } }),
});
