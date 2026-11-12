import { trpcServer } from '@hono/trpc-server';
import { type StorefrontContext } from 'app/api/storefront/context';
import { storefrontRouter } from 'app/api/storefront/router';
import { extendLogContext, getLogger } from 'app/lib/logger';
import { authenticate } from 'app/shopify.server';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import { catchRejection } from '../middleware/catch-rejection';

type StorefrontEnv = { Bindings: Env; Variables: StorefrontContext };

const logger = getLogger(['app', 'api', 'storefront']);

// Theme app extensions call `/apps/<subpath>/...` on the shop's own domain, and Shopify forwards
// it here with a signed query string (the app proxy). Same origin for the browser, so no CORS.
const proxyMiddleware = createMiddleware<StorefrontEnv>(async (c, next) => {
  const proxy = await catchRejection(authenticate.public.appProxy(c.req.raw));
  if (proxy instanceof Response) {
    return proxy;
  }

  // Both are covered by the signature checked above.
  const shop = c.req.query('shop');
  if (!shop) {
    return c.json({ error: 'Missing shop' }, 400);
  }

  extendLogContext({ shop });
  c.set('shop', shop);
  c.set('customerId', c.req.query('logged_in_customer_id') || null);
  c.set('admin', proxy.admin);
  c.set('storefront', proxy.storefront);

  await next();
});

export const storefront = new Hono<StorefrontEnv>().use(proxyMiddleware).use(
  '*',
  trpcServer({
    router: storefrontRouter,
    createContext: (_options, c): StorefrontContext => ({
      shop: c.get('shop'),
      customerId: c.get('customerId'),
      admin: c.get('admin'),
      storefront: c.get('storefront'),
    }),
    onError: ({ error, path }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') logger.error(error, { path });
    },
  }),
);
