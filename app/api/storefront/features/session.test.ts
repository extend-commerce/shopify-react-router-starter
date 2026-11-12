import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { createCallerFactory } from '../procedures';
import { storefrontRouter } from '../router';

// Procedures are tested by calling them with a ctx, no HTTP or Shopify auth involved.
const createCaller = createCallerFactory(storefrontRouter);
const guest = createCaller({ shop: 'example.myshopify.com', customerId: null });
const customer = createCaller({
  shop: 'example.myshopify.com',
  customerId: '42',
});

describe('storefront session', () => {
  it('tells a guest apart from a logged-in customer', async () => {
    await expect(guest.session.get()).resolves.toEqual({
      shop: 'example.myshopify.com',
      loggedIn: false,
    });
    await expect(customer.session.get()).resolves.toEqual({
      shop: 'example.myshopify.com',
      loggedIn: true,
    });
  });

  it('returns the customer to a logged-in customer', async () => {
    await expect(customer.session.customer()).resolves.toEqual({ customerId: '42' });
  });

  it('rejects a guest from a customer procedure', async () => {
    await expect(guest.session.customer()).rejects.toThrow(TRPCError);
    await expect(guest.session.customer()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
