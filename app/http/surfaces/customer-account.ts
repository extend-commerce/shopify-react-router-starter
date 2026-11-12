import { trpcServer } from '@hono/trpc-server';
import { type CustomerAccountContext } from 'app/api/customer-account/context';
import { customerAccountRouter } from 'app/api/customer-account/router';
import { extendLogContext, getLogger } from 'app/lib/logger';
import { authenticate } from 'app/shopify.server';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import { catchRejection } from '../middleware/catch-rejection';

type CustomerAccountEnv = { Bindings: Env; Variables: CustomerAccountContext };

const logger = getLogger(['app', 'api', 'customer-account']);

// Customer account UI extensions call the app directly (cross-origin) with a session token, so
// every response, errors included, needs CORS headers the extension can read.
const authMiddleware = createMiddleware<CustomerAccountEnv>(async (c, next) => {
  const auth = await catchRejection(authenticate.public.customerAccount(c.req.raw));
  if (auth instanceof Response) {
    // Shopify's invalid-token 401 has no CORS headers, so the extension couldn't read its status.
    auth.headers.set('Access-Control-Allow-Origin', '*');
    return auth;
  }

  if (!auth.sessionToken.sub) {
    return auth.cors(Response.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const { dest } = auth.sessionToken;
  const shop = new URL(dest.includes('://') ? dest : `https://${dest}`).hostname;
  extendLogContext({ shop });
  c.set('shop', shop);
  c.set('customerId', auth.sessionToken.sub);

  await next();
  c.res = auth.cors(c.res);
});

export const customerAccount = new Hono<CustomerAccountEnv>().use(authMiddleware).use(
  '*',
  trpcServer({
    router: customerAccountRouter,
    createContext: (_options, c): CustomerAccountContext => ({
      shop: c.get('shop'),
      customerId: c.get('customerId'),
    }),
    onError: ({ error, path }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') logger.error(error, { path });
    },
  }),
);
