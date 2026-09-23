import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import {
  defineConfig,
  type Plugin,
  type UserConfig,
  type ViteBuilder,
} from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// React Router's own `builder.buildApp` (registered by the `reactRouter()` plugin below, only
// active because react-router.config.ts opts into `future.v8_viteEnvironmentApi`) builds the
// "client" environment and its own "ssr" environment, then stops — it has no notion of
// `@cloudflare/vite-plugin`'s separate Worker environment (named after wrangler.jsonc's `name`,
// with `-` replaced by `_`: "shopify_remix_starter"), so that environment, which is what
// wrangler.jsonc's `main` (workers/app.ts) and an actual `wrangler deploy` need, never gets built
// by a plain `react-router build`.
//
// This plugin's `config` hook runs with `order: 'post'`, so it sees the fully-merged config and
// replaces `builder.buildApp` outright rather than composing with React Router's version: React
// Router's own buildApp additionally builds the "ssr" environment (a Node-shaped bundle, unused
// under Workers per workers-compatible-build.md) and then deletes the client build's
// `.vite/manifest.json` as a tidiness step once its own build finishes — but the Cloudflare Worker
// environment's build needs that manifest to resolve `virtual:react-router/server-manifest`
// (imported by workers/app.ts's `virtual:react-router/server-build`), so it must run before that
// cleanup, not after. Skipping the unused "ssr" build sidesteps the ordering conflict entirely
// instead of working around it. See wrangler.staging.jsonc for where the resulting bundle is
// consumed.
function buildCloudflareWorkerEnvironment(): Plugin {
  return {
    name: 'build-cloudflare-worker-environment',
    config: {
      order: 'post',
      handler() {
        return {
          builder: {
            buildApp: async (builder: ViteBuilder) => {
              await builder.build(builder.environments.client);
              // Picked by elimination, not by name, since @cloudflare/vite-plugin derives this
              // environment's name from wrangler.jsonc's `name` field (kebab-case turned to
              // snake_case) rather than a fixed string. Failing loudly on zero OR more than one
              // match (instead of silently taking `.find()`'s first result) means a future
              // third-party Vite plugin that registers its own environment breaks this build with
              // a clear error, not a silently wrong deploy.
              const workerEnvironmentNames = Object.keys(
                builder.environments,
              ).filter(name => name !== 'client' && name !== 'ssr');
              if (workerEnvironmentNames.length !== 1) {
                throw new Error(
                  `Expected exactly one Worker environment from @cloudflare/vite-plugin, found: ${JSON.stringify(workerEnvironmentNames)}`,
                );
              }
              await builder.build(
                builder.environments[workerEnvironmentNames[0]],
              );
            },
          },
        };
      },
    },
  };
}

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
    // combination hits a known upstream crash ("filename.replace is not a function",
    // https://github.com/cloudflare/workers-sdk/issues/9036) still reproducing on the latest
    // @cloudflare/vite-plugin/wrangler as of this writing — confirmed for both `vite dev` and
    // `react-router build`. Using the plugin's own separate Worker environment (this default)
    // keeps `vite dev`/`wrangler dev` working; `buildCloudflareWorkerEnvironment()` below (added
    // by the wrangler-configuration ticket) is what makes `react-router build` actually build that
    // separate environment into a deployable bundle instead of leaving it unbuilt.
    cloudflare(),
    reactRouter(),
    tsconfigPaths(),
    buildCloudflareWorkerEnvironment(),
  ],
  ssr: {
    noExternal: ['posthog-js', 'posthog-js/react'],
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      // `vite dev`'s dependency optimizer (esbuild) still scans this config's Node-oriented
      // default "ssr" environment even though `buildCloudflareWorkerEnvironment()` skips building
      // it for real deploys; esbuild can't resolve a Workers-only virtual module like
      // `cloudflare:workers` (used by app/db.server.ts), so it's externalized rather than
      // resolved.
      external: ['cloudflare:workers'],
    },
  },
  optimizeDeps: {
    include: ['@shopify/app-bridge-react'],
  },
}) satisfies UserConfig;
