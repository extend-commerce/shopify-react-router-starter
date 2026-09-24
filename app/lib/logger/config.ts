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

// Called once from the Worker entry. `contextLocalStorage` enables `withContext()`, which the
// entry uses to stamp every log line of a request with its `requestId`/`path`.
export function configureLogging(): void {
  if (configured) return;
  configured = true;

  const lowestLevel = isProduction ? 'info' : 'debug';

  configureSync({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {
      console: getConsoleSink({
        formatter: import.meta.env.DEV ? getPrettyFormatter() : jsonFormatter,
      }),
    },
    loggers: [
      { category: ['app'], sinks: ['console'], lowestLevel },
      // Logs from @shopify/shopify-app-react-router, bridged in shopify.server.ts. Kept as its own
      // category so a log backend can filter it apart from app logs.
      { category: ['shopify'], sinks: ['console'], lowestLevel },
      // LogTape's own meta logger (sink errors etc.).
      {
        category: ['logtape', 'meta'],
        sinks: ['console'],
        lowestLevel: 'warning',
      },
    ],
  });
}
