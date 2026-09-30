// .dev.vars makes wrangler ignore the Shopify CLI and load this file instead.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hits = readdirSync(root).filter(
  name => name === '.dev.vars' || name.startsWith('.dev.vars.'),
);

if (hits.length > 0) {
  console.error(
    `Refusing to start: ${hits.join(', ')} is present. Wrangler would ignore the Shopify CLI and .env. Move those values into .env and delete the file.`,
  );
  process.exit(1);
}
