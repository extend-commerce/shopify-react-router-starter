import {
  AppDistribution,
  LogSeverity,
  shopifyApp,
} from '@shopify/shopify-app-react-router/server';
// Runs after the Web API adapter that '@shopify/shopify-app-react-router/server' imports
// internally, so this one's abstract-runtime registration wins. There's no Workers-specific
// adapter package for shopify-app-react-router itself (only 'adapters/node' exists, and it's
// Node-only in name alone — no true Node APIs); the underlying shopify-api Web API adapter it
// pulls in is already Workers-compatible (fetch/Request/Response), so this import is purely for
// an accurate runtime label.
import '@shopify/shopify-api/adapters/cf-worker';
import { DrizzleSessionStorageSQLite } from '@shopify/shopify-app-session-storage-drizzle';
import { db } from './db.server';
import { sessionTable } from './db/schema';
import { extendLogContext, getLogger } from './lib/logger';
import { redactShopifyLogMessage } from './lib/logger/redact-shopify-message';
import { apiVersion } from './lib/shopify-api-version';

export { apiVersion };
// Debug locally, where `import.meta.env.DEV` is set. Staging and production stay at info.
const shopifyLogLevel = import.meta.env.DEV
  ? LogSeverity.Debug
  : LogSeverity.Info;
const shopifyLogger = getLogger(['shopify']);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  apiVersion,
  scopes: process.env.SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL || '',
  authPathPrefix: '/auth',
  sessionStorage: new DrizzleSessionStorageSQLite(db, sessionTable),
  distribution: AppDistribution.AppStore,
  logger: {
    level: shopifyLogLevel,
    // Off even when the level is debug: otherwise every Admin API call logs its response headers.
    httpRequests: false,
    log: (severity: LogSeverity, msg: string) => {
      const levelMap = {
        [LogSeverity.Error]: 'error',
        [LogSeverity.Warning]: 'warn',
        [LogSeverity.Info]: 'info',
        [LogSeverity.Debug]: 'debug',
      } as const satisfies Record<LogSeverity, string>;

      shopifyLogger.log(levelMap[severity], redactShopifyLogMessage(msg));
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;

// Shop and session id exist only after auth succeeds. `enterWith` stamps them on the rest of
// this request; lines emitted inside `authenticate` itself still carry only requestId and path.
async function authenticateAdmin(request: Request) {
  const result = await shopify.authenticate.admin(request);
  extendLogContext({
    shop: result.session.shop,
    sessionId: result.session.id,
  });
  return result;
}

async function authenticateWebhook(request: Request) {
  const result = await shopify.authenticate.webhook(request);
  extendLogContext({
    shop: result.shop,
    ...(result.session ? { sessionId: result.session.id } : {}),
  });
  return result;
}

export const authenticate = {
  ...shopify.authenticate,
  admin: authenticateAdmin,
  webhook: authenticateWebhook,
} satisfies typeof shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

export type AdminApiContext = Awaited<ReturnType<typeof authenticate.admin>>;
export type AdminApiContextWithoutRest = AdminApiContext['admin'];
