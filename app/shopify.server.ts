import '@shopify/shopify-app-react-router/adapters/node';
import {
  ApiVersion,
  AppDistribution,
  LogSeverity,
  shopifyApp,
} from '@shopify/shopify-app-react-router/server';
import { DrizzleSessionStoragePostgres } from '@shopify/shopify-app-session-storage-drizzle';
import { db } from './db.server';
import { sessionTable } from './db/schema';
import logger from './lib/logger';

export const apiVersion = ApiVersion.October25;
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = isProduction ? LogSeverity.Info : LogSeverity.Debug;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  apiVersion,
  scopes: process.env.SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL || '',
  authPathPrefix: '/auth',
  sessionStorage: new DrizzleSessionStoragePostgres(db, sessionTable),
  distribution: AppDistribution.AppStore,
  logger: {
    level: logLevel,
    httpRequests: true,
    log: (severity: LogSeverity, msg: string) => {
      const levelMap = {
        [LogSeverity.Error]: 'error',
        [LogSeverity.Warning]: 'warn',
        [LogSeverity.Info]: 'info',
        [LogSeverity.Debug]: 'debug',
      } as const satisfies Record<LogSeverity, string>;

      logger.log(levelMap[severity], msg);
    },
  },
  hooks: {
    async afterAuth({ session }) {
      await shopify.registerWebhooks({ session });
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

export type AdminApiContext = Awaited<ReturnType<typeof authenticate.admin>>;
export type AdminApiContextWithoutRest = AdminApiContext['admin'];
