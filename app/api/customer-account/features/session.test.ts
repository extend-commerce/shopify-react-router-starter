import { describe, expect, it } from 'vitest';

import { createCallerFactory } from '../procedures';
import { customerAccountRouter } from '../router';

// Procedures are tested by calling them with a ctx, no HTTP or Shopify auth involved.
const createCaller = createCallerFactory(customerAccountRouter);
const caller = createCaller({
  shop: 'example.myshopify.com',
  customerId: 'gid://shopify/Customer/42',
});

describe('customer account session', () => {
  it('returns the shop and customer from ctx', async () => {
    await expect(caller.session.get()).resolves.toEqual({
      shop: 'example.myshopify.com',
      customerId: 'gid://shopify/Customer/42',
    });
  });
});
