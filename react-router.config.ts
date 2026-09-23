import { type Config } from '@react-router/dev/config';

export default {
  // Matches @cloudflare/vite-plugin's expected Worker/asset output layout (dist/client +
  // dist/<worker>), instead of React Router's Node-oriented default of `build/`.
  buildDirectory: 'dist',
  future: {
    // Opts `react-router build` into Vite's multi-environment Environment API build path, the
    // only one that also builds @cloudflare/vite-plugin's separate Worker ("workerd") environment
    // (targeting workers/app.ts per wrangler.jsonc's `main`). Without this flag, `react-router
    // build` uses a classic single-environment build that only ever produces the client bundle
    // and React Router's own (Node-shaped, unused for Workers) "ssr" bundle — never a real,
    // deployable Worker script. See wrangler.staging.jsonc's comments for how this feeds `wrangler
    // deploy`.
    //
    // Gated to the `build` script only (via `IS_REACT_ROUTER_BUILD`, set in package.json's
    // `build` script), not enabled globally: turning it on for `vite dev` too breaks `pnpm start`
    // outright ("Invalid hook call" / duplicate React copies from a different dep-optimization
    // path the flag takes in dev) — confirmed by trying. `vite dev` doesn't need this flag anyway,
    // since @cloudflare/vite-plugin's Worker environment already runs live under `vite dev`
    // regardless of it (that's how `pnpm start` has always served real requests through workerd).
    v8_viteEnvironmentApi: process.env.IS_REACT_ROUTER_BUILD === '1',
  },
} satisfies Config;
