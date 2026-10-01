import { type Config } from '@react-router/dev/config';

export default {
  // Build to dist/client and dist/server (the Worker), where wrangler.staging.jsonc and
  // wrangler.production.jsonc look for them.
  buildDirectory: 'dist',
  future: {
    // Builds through Vite's Environment API, which is how @cloudflare/vite-plugin's `ssr` Worker
    // environment gets built. Default in React Router 8.
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
