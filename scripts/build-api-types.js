// Builds packages/api-types: the tRPC router types extensions import through @packages/api-client.
//
// `tsc` writes declarations but keeps `app/...` path-alias imports as they are, and an extension
// can't resolve those, so the types they point at would silently become `any`. After each emit,
// this rewrites them to relative paths: to the emitted declaration when there is one, otherwise to
// a .d.ts that lives in the repo (such as the generated GraphQL types in app/types).
//
// Usage: node scripts/build-api-types.js [--watch]
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'packages/api-types/dist');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const watch = process.argv.includes('--watch');

const aliasImport = /(\bfrom\s+|\bimport\s*\(\s*)(['"])app\/([^'"]+)\2/g;

function declarationFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return declarationFiles(path);
    return entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

// Where `app/<path>` should point from inside dist, or null if neither copy exists.
function resolveAlias(path) {
  for (const base of [join(dist, 'app', path), join(root, 'app', path)]) {
    if (existsSync(`${base}.d.ts`)) return base;
    if (existsSync(join(base, 'index.d.ts'))) return join(base, 'index');
  }
  return null;
}

function rewriteAliases() {
  const unresolved = new Set();
  for (const file of declarationFiles(dist)) {
    const source = readFileSync(file, 'utf8');
    const rewritten = source.replace(aliasImport, (match, keyword, quote, path) => {
      const target = resolveAlias(path);
      if (!target) {
        unresolved.add(`app/${path}`);
        return match;
      }
      const specifier = relative(dirname(file), target).split(sep).join('/');
      return `${keyword}${quote}${specifier.startsWith('.') ? specifier : `./${specifier}`}${quote}`;
    });
    if (rewritten !== source) writeFileSync(file, rewritten);
  }
  for (const path of unresolved) {
    console.warn(`api:types: can't resolve '${path}'; extensions will see its types as any.`);
  }
}

const args = [tsc, '-p', join(root, 'tsconfig.api-types.json')];

if (watch) {
  // tsc prints this line after every rebuild, errors or not.
  const child = spawn(process.execPath, [...args, '--watch', '--preserveWatchOutput'], {
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  child.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    if (String(chunk).includes('Watching for file changes')) rewriteAliases();
  });
  child.on('exit', code => process.exit(code ?? 0));
} else {
  // Start clean so types of deleted procedures don't linger.
  rmSync(dist, { recursive: true, force: true });
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', code => {
    if (code !== 0) process.exit(code ?? 1);
    rewriteAliases();
  });
}
