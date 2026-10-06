import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, type UserConfig } from 'vite';

// Shopify CLI exposes its tunnel as HOST/APP_URL; the app runtime expects SHOPIFY_APP_URL.
const cliAppUrl = process.env.HOST ?? process.env.APP_URL;
if (!process.env.SHOPIFY_APP_URL && cliAppUrl) {
  // @ts-expect-error - SHOPIFY_APP_URL is read-only
  process.env.SHOPIFY_APP_URL = cliAppUrl;
}

const host = new URL(process.env.SHOPIFY_APP_URL || 'http://localhost').hostname;

export default defineConfig({
  server: {
    // Vite must accept requests forwarded through Shopify CLI's tunnel hostname.
    allowedHosts: [host],
    // Let the app, rather than Vite, answer extension-to-app preflight requests.
    cors: {
      preflightContinue: true,
    },
    // Shopify CLI forwards its proxy to the injected PORT.
    port: Number(process.env.PORT || 3000),
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
    // Emit assets as files instead of embedding data URIs in the Worker build.
    assetsInlineLimit: 0,
  },
}) satisfies UserConfig;
