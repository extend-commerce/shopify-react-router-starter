import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, type UserConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the dev server. The CLI will eventually
// stop passing in HOST, so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  // @ts-expect-error - SHOPIFY_APP_URL is read-only
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
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
      allow: ['app', 'node_modules'],
    },
  },
  plugins: [reactRouter(), tsconfigPaths()],
  ssr: {
    noExternal: ['posthog-js', 'posthog-js/react'],
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      // Resolved by the Workers runtime at request time; the Node/Vite build can't (and
      // shouldn't) bundle it. Node-targeted execution of this build (`pnpm start`) will fail
      // until the Workers-compatible build (piece 2) replaces it.
      external: ['cloudflare:workers'],
    },
  },
  optimizeDeps: {
    include: ['@shopify/app-bridge-react'],
  },
}) satisfies UserConfig;
