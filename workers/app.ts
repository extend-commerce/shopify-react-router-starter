/// <reference types="@cloudflare/workers-types" />
import { createRequestHandler, type AppLoadContext } from 'react-router';

interface Env {
  DB: D1Database;
}

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    const loadContext: AppLoadContext = { cloudflare: { env, ctx } };
    return requestHandler(request, loadContext);
  },
} satisfies ExportedHandler<Env>;
