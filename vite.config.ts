import { cloudflare } from '@cloudflare/vite-plugin';
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
      allow: ['app', 'workers', 'node_modules'],
    },
  },
  plugins: [
    // Deliberately NOT `cloudflare({ viteEnvironment: { name: 'ssr' } })` (the config that lets
    // the plugin reuse React Router's own SSR build instead of a separate "workerd" one): that
    // combination hits a known upstream `vite dev` crash ("filename.replace is not a function",
    // https://github.com/cloudflare/workers-sdk/issues/9036) still reproducing on the latest
    // @cloudflare/vite-plugin/wrangler as of this writing. Using the plugin's own separate Worker
    // environment (this default) keeps `vite dev`/`wrangler dev` working; the tradeoff is that
    // `react-router build`'s own "ssr" output (dist/server/index.js) is a Node-shaped bundle the
    // real Workers deploy doesn't use — piece 3 (wrangler-configuration ticket) owns wiring an
    // actual deploy build for workers/app.ts's Worker environment.
    cloudflare(),
    reactRouter(),
    tsconfigPaths(),
  ],
  ssr: {
    noExternal: ['posthog-js', 'posthog-js/react'],
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      // React Router's own (Node-oriented) "ssr" build environment still runs during
      // `react-router build` alongside the Cloudflare plugin's separate Worker/"workerd"
      // environment (the one workers/app.ts and wrangler.jsonc's `main` actually target). Rollup
      // can't bundle a Workers-only virtual module for that unused Node-target bundle, so it's
      // externalized rather than resolved.
      external: ['cloudflare:workers'],
    },
  },
  optimizeDeps: {
    include: ['@shopify/app-bridge-react'],
  },
}) satisfies UserConfig;
