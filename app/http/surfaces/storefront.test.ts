import { fromPartial } from '@total-typescript/shoehorn';
import { authenticate } from 'app/shopify.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../app';

const { logger } = vi.hoisted(() => ({ logger: { error: vi.fn() } }));

vi.mock('app/lib/logger', () => ({ getLogger: () => logger, extendLogContext: vi.fn() }));
vi.mock('app/shopify.server', () => ({
  authenticate: { public: { customerAccount: vi.fn(), appProxy: vi.fn() } },
}));

// What Shopify forwards from `/apps/<subpath>/session.get` on the shop's domain.
function proxied(procedure: string, customerId = '') {
  const query = new URLSearchParams({
    shop: 'example.myshopify.com',
    logged_in_customer_id: customerId,
    path_prefix: '/apps/example',
    timestamp: '1700000000',
    signature: 'signed',
  });
  return new Request(`https://app.example.com/api/storefront/${procedure}?${query}`);
}

describe('/api/storefront', () => {
  beforeEach(() => {
    vi.mocked(authenticate.public.appProxy).mockResolvedValue(fromPartial({}));
  });

  it('runs a procedure for a guest', async () => {
    const response = await api.fetch(proxied('session.get'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { data: { shop: 'example.myshopify.com', loggedIn: false } },
    });
  });

  it('passes the logged-in customer to procedures', async () => {
    const response = await api.fetch(proxied('session.customer', '42'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { data: { customerId: '42' } } });
  });

  it('answers a guest calling a customer procedure with 401', async () => {
    const response = await api.fetch(proxied('session.customer'));

    expect(response.status).toBe(401);
  });

  it("returns Shopify's rejection of a bad signature", async () => {
    vi.mocked(authenticate.public.appProxy).mockRejectedValue(
      new Response(undefined, { status: 400 }),
    );

    const response = await api.fetch(proxied('session.get'));

    expect(response.status).toBe(400);
  });
});
