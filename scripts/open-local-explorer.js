// Opens Cloudflare's Local Explorer (browse D1 tables, run SQL, inspect bindings) for the
// running `pnpm dev` server. Shopify CLI hides Vite's own `e + enter` shortcut for it.
import { spawn } from 'node:child_process';

// shopify.web.toml pins the dev server to this port.
const port = process.env.PORT || 3000;
const url = `http://localhost:${port}/cdn-cgi/local/explorer`;

try {
  await fetch(url, { method: 'HEAD' });
} catch {
  console.error(
    `Nothing is listening on localhost:${port}. Start the app with \`pnpm dev\` first.`,
  );
  process.exit(1);
}

// in linux, we use `xdg-open` to open the browser
let [command, args] = ['xdg-open', [url]];
// in macos, we use `open` to open the browser
if (process.platform === 'darwin') {
  [command, args] = ['open', [url]];
}
// in windows, we use `cmd` to open the browser
if (process.platform === 'win32') {
  [command, args] = ['cmd', ['/c', 'start', '', url]];
}

console.log(`Opening Cloudflare Local Explorer: ${url}`);
spawn(command, args, { stdio: 'ignore', detached: true })
  .on('error', () => console.log('Could not open a browser. Visit the URL above instead.'))
  .unref();
