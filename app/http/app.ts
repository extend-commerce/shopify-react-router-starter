import { Hono } from 'hono';

import { customerAccount } from './surfaces/customer-account';
import { storefront } from './surfaces/storefront';

/**
 * Everything under `/api/*`, handed over by app/routes/api.$.ts. Each surface authenticates its
 * callers here, then passes them to its tRPC router in app/api. Writing procedures never needs
 * this folder; adding a new surface or a non-tRPC endpoint does. See docs/api.md.
 */
export const api = new Hono<{ Bindings: Env }>()
  .basePath('/api')
  .route('/customer-account', customerAccount)
  .route('/storefront', storefront);
