// Runs before every test file, ahead of any app module: the real `app/shopify.server.ts` reads
// these at import time, and the Shopify library captures the global `fetch` when first imported.
import { afterAll, afterEach, vi } from 'vitest';

import { miniflare } from './cloudflare-workers';
import { installShopifyFetchStub } from './shopify-mock';

Object.assign(process.env, {
  SHOPIFY_API_KEY: 'validation-api-key',
  SHOPIFY_API_SECRET: 'validation-api-secret',
  SHOPIFY_APP_URL: 'https://app.example.com',
  SCOPES: 'read_products',
});

installShopifyFetchStub();

// Interleaving hooks are spies on the real database handle; undo them after every test.
afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await miniflare.dispose();
});
