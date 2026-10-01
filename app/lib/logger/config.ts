import {
  configureSync,
  getConsoleSink,
  getJsonLinesFormatter,
  type TextFormatter,
} from '@logtape/logtape';
import { getPrettyFormatter } from '@logtape/pretty';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isProduction } from '../env';

// One JSON object per line is what Workers Logs indexes (and exports to OTel destinations);
// console.log already appends the newline, so the formatter's own trailing one is dropped.
const jsonLines = getJsonLinesFormatter();
const jsonFormatter: TextFormatter = record => jsonLines(record).trimEnd();

let configured = false;

// Same store LogTape reads. `withContext` in the Worker entry sets `requestId` and `path`;
// `extendLogContext` adds fields later in the request (shop, session id) without a callback.
const contextLocalStorage = new AsyncLocalStorage<Record<string, unknown>>();

// workerd doesn't implement `enterWith()`, so this mutates the store instead. `withContext`
// creates a fresh object per call and LogTape reads it on every log, so the new fields reach
// every later line of this request and never leak into another. Outside a request it's a no-op.
export function extendLogContext(context: Record<string, unknown>): void {
  const store = contextLocalStorage.getStore();
  if (store) Object.assign(store, context);
}

// Called once from the Worker entry. `contextLocalStorage` enables `withContext()`, which the
// entry uses to stamp every log line of a request with its `requestId`/`path`.
export function configureLogging(): void {
  if (configured) return;
  configured = true;

  // App code stays debug on staging. The Shopify library is debug only in local dev; staging
  // and production stay at info so those debug lines (session tokens, API chatter) are never built.
  const appLevel = isProduction ? 'info' : 'debug';
  const shopifyLevel = import.meta.env.DEV ? 'debug' : 'info';

  configureSync({
    contextLocalStorage,
    sinks: {
      console: getConsoleSink({
        formatter: import.meta.env.DEV ? getPrettyFormatter() : jsonFormatter,
      }),
    },
    loggers: [
      // `app.webhooks` inherits this logger, so webhook routes are filterable without their own level.
      { category: ['app'], sinks: ['console'], lowestLevel: appLevel },
      // Logs from @shopify/shopify-app-react-router, bridged in shopify.server.ts. Kept as its own
      // category so a log backend can filter it apart from app logs.
      { category: ['shopify'], sinks: ['console'], lowestLevel: shopifyLevel },
      // LogTape's own meta logger (sink errors etc.).
      {
        category: ['logtape', 'meta'],
        sinks: ['console'],
        lowestLevel: 'warning',
      },
    ],
  });
}
