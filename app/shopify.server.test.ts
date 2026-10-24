import { fromPartial } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Shop } from './server/shop.server';

const mocks = vi.hoisted(() => ({
  libraryAdmin: vi.fn(),
  ensureShop: vi.fn(),
  db: { name: 'db' },
}));

// The wrapper under test builds the library app at import time, so the library, the D1 binding
// and the session storage are replaced; only the wrapper's own behavior is exercised.
vi.mock('@shopify/shopify-app-react-router/server', () => ({
  AppDistribution: { AppStore: 'app_store' },
  LogSeverity: { Error: 0, Warning: 1, Info: 2, Debug: 3 },
  shopifyApp: () => ({
    authenticate: { admin: mocks.libraryAdmin, webhook: vi.fn() },
    addDocumentResponseHeaders: vi.fn(),
    unauthenticated: {},
    registerWebhooks: vi.fn(),
    sessionStorage: {},
  }),
}));
vi.mock('@shopify/shopify-api/adapters/cf-worker', () => ({}));
vi.mock('@shopify/shopify-app-session-storage-drizzle', () => ({
  DrizzleSessionStorageSQLite: vi.fn(),
}));
vi.mock('./db.server', () => ({ db: mocks.db }));
vi.mock('./server/shop.server', () => ({ ensureShop: mocks.ensureShop }));

import { authenticate } from './shopify.server';

const SHOP_DOMAIN = 'test-shop.myshopify.com';

function mockAuthenticatedAdmin() {
  const admin = { graphql: vi.fn() };
  const session = { id: `offline_${SHOP_DOMAIN}`, shop: SHOP_DOMAIN };
  mocks.libraryAdmin.mockResolvedValue({ admin, session });
  return { admin, session };
}

describe('authenticate.admin', () => {
  const request = new Request(`https://app.example.com/app?shop=${SHOP_DOMAIN}`);

  beforeEach(() => {
    mocks.ensureShop.mockReset();
    mocks.libraryAdmin.mockReset();
  });

  it('ensures the installed Shop for the session domain with the admin client', async () => {
    const { admin } = mockAuthenticatedAdmin();
    mocks.ensureShop.mockResolvedValue(fromPartial<Shop>({ id: 1 }));

    await authenticate.admin(request);

    expect(mocks.ensureShop).toHaveBeenCalledWith(mocks.db, SHOP_DOMAIN, admin);
  });

  it('returns the ensured Shop row next to the library context', async () => {
    const { admin, session } = mockAuthenticatedAdmin();
    const shop = fromPartial<Shop>({ id: 1, myshopifyDomain: SHOP_DOMAIN });
    mocks.ensureShop.mockResolvedValue(shop);

    const context = await authenticate.admin(request);

    expect(context).toMatchObject({ admin, session, shop });
  });

  it('fails the request when the Shop cannot be ensured', async () => {
    mockAuthenticatedAdmin();
    mocks.ensureShop.mockRejectedValue(new Error('snapshot failed'));

    await expect(authenticate.admin(request)).rejects.toThrow('snapshot failed');
  });

  it('does not ensure a Shop when the library rejects the request', async () => {
    const redirect = new Response(null, { status: 302 });
    mocks.libraryAdmin.mockRejectedValue(redirect);

    await expect(authenticate.admin(request)).rejects.toBe(redirect);
    expect(mocks.ensureShop).not.toHaveBeenCalled();
  });
});
