/// <reference types="@cloudflare/workers-types" />
import { withContext } from '@logtape/logtape';
import { createRequestHandler, type AppLoadContext } from 'react-router';
import { configureLogging } from '../app/lib/logger/config';

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

configureLogging();

export default {
  fetch(request, env, ctx) {
    const loadContext: AppLoadContext = { cloudflare: { env, ctx } };
    // Every log line written while handling this request carries its id and path. `cf-ray` is
    // Cloudflare's per-request id, so a log line can be matched to the request in the dashboard.
    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
    const { pathname } = new URL(request.url);
    return withContext({ requestId, path: pathname }, () =>
      requestHandler(request, loadContext),
    );
  },
} satisfies ExportedHandler<Env>;
