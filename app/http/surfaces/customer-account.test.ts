import { fromPartial } from '@total-typescript/shoehorn';
import { authenticate } from 'app/shopify.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../app';

const { logger } = vi.hoisted(() => ({ logger: { error: vi.fn() } }));

vi.mock('app/lib/logger', () => ({ getLogger: () => logger, extendLogContext: vi.fn() }));
vi.mock('app/shopify.server', () => ({
  authenticate: { public: { customerAccount: vi.fn(), appProxy: vi.fn() } },
}));

const url = 'https://app.example.com/api/customer-account/session.get';

// Stands in for Shopify's helper, which adds CORS headers to a response.
function cors(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}

function signedIn(sub: string | undefined, dest = 'https://example.myshopify.com') {
  vi.mocked(authenticate.public.customerAccount).mockResolvedValue(
    fromPartial({ sessionToken: { sub, dest }, cors }),
  );
}

describe('/api/customer-account', () => {
  beforeEach(() => {
    signedIn('gid://shopify/Customer/42');
  });

  it.each(['https://example.myshopify.com', 'example.myshopify.com'])(
    'runs the procedure with destination %s, with CORS headers',
    async dest => {
      signedIn('gid://shopify/Customer/42', dest);
      const response = await api.fetch(new Request(url));

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      await expect(response.json()).resolves.toEqual({
        result: {
          data: { shop: 'example.myshopify.com', customerId: 'gid://shopify/Customer/42' },
        },
      });
    },
  );

  it("returns Shopify's rejection with CORS headers so the extension can read it", async () => {
    vi.mocked(authenticate.public.customerAccount).mockRejectedValue(
      new Response(undefined, { status: 401 }),
    );

    const response = await api.fetch(new Request(url));

    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it("returns Shopify's answer to a CORS preflight", async () => {
    vi.mocked(authenticate.public.customerAccount).mockRejectedValue(
      new Response(null, { status: 204 }),
    );

    const response = await api.fetch(new Request(url, { method: 'OPTIONS' }));

    expect(response.status).toBe(204);
  });

  it('rejects a session token without a customer', async () => {
    signedIn(undefined);

    const response = await api.fetch(new Request(url));

    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('answers an unknown procedure with 404, with CORS headers', async () => {
    const response = await api.fetch(new Request(url.replace('session.get', 'session.nope')));

    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
