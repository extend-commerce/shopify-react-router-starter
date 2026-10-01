import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, type UserConfig } from 'vite';

// The Shopify CLI sets HOST and APP_URL, never SHOPIFY_APP_URL. Copy it across
// before the Cloudflare plugin builds the Worker's env. The local wrangler
// allowlist is what enters the Worker, so HOST itself stays in this process.
// Outside the CLI (`pnpm build`) neither is set, and assigning `undefined` to
// process.env would store the string "undefined".
const cliAppUrl = process.env.HOST ?? process.env.APP_URL;
if (!process.env.SHOPIFY_APP_URL && cliAppUrl) {
  // @ts-expect-error - SHOPIFY_APP_URL is read-only
  process.env.SHOPIFY_APP_URL = cliAppUrl;
}

const host = new URL(process.env.SHOPIFY_APP_URL || 'http://localhost')
  .hostname;

let hmrConfig;
if (host === 'localhost') {
  hmrConfig = {
    protocol: 'ws',
    host: 'localhost',
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: 'wss',
    host: host,
    port: parseInt(process.env.FRONTEND_PORT || '8002', 10),
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ['app', 'workers', 'node_modules'],
    },
  },
  plugins: [
    // Builds the Worker as React Router's `ssr` environment, so `react-router build` emits one
    // deployable Worker (Cloudflare's own React Router template does the same).
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    assetsInlineLimit: 0,
  },
}) satisfies UserConfig;
