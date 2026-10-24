import { createHmac } from 'node:crypto';

import { fromPartial } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test-secret';

const { libraryWebhook, logger } = vi.hoisted(() => ({
  libraryWebhook: vi.fn(),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    with: vi.fn(),
  },
}));

// `shopifyApp` is replaced so the test drives what the library's `authenticate.webhook` does,
// and so no real Shopify config or D1 binding is needed.
vi.mock('@shopify/shopify-app-react-router/server', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  shopifyApp: () => ({
    authenticate: { admin: vi.fn(), webhook: libraryWebhook },
    addDocumentResponseHeaders: vi.fn(),
    unauthenticated: {},
    registerWebhooks: vi.fn(),
    sessionStorage: {},
  }),
}));
vi.mock('@shopify/shopify-app-session-storage-drizzle', () => ({
  DrizzleSessionStorageSQLite: vi.fn(),
}));
vi.mock('./db.server', () => ({ db: {} }));
vi.mock('./lib/logger', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => logger,
}));

vi.stubEnv('SHOPIFY_API_SECRET', SECRET);
const { authenticate } = await import('./shopify.server');

const BODY = JSON.stringify({ id: 1 });

function webhookRequest({
  topic = 'app/uninstalled',
  body = BODY,
  hmac = createHmac('sha256', SECRET).update(body).digest('base64'),
}: { topic?: string; body?: string; hmac?: string } = {}) {
  return new Request('https://app.example.com/webhooks', {
    method: 'POST',
    body,
    headers: {
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': 'shop.myshopify.com',
      'X-Shopify-API-Version': '2026-07',
      'X-Shopify-Webhook-Id': 'webhook-1',
      'X-Shopify-Triggered-At': '2026-01-02T03:04:05.000Z',
    },
  });
}

// What the library throws when refreshing an expired offline token fails.
const libraryFailure = () => new Response(undefined, { status: 500 });

async function thrownBy(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

describe('authenticate.webhook', () => {
  beforeEach(() => {
    libraryWebhook.mockReset();
  });

  it('returns the library result when authentication succeeds', async () => {
    const context = fromPartial<Awaited<ReturnType<typeof authenticate.webhook>>>({
      shop: 'shop.myshopify.com',
      topic: 'APP_UNINSTALLED',
      session: { id: 'offline_shop.myshopify.com' },
    });
    libraryWebhook.mockResolvedValue(context);

    await expect(authenticate.webhook(webhookRequest())).resolves.toBe(context);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['401', new Response(undefined, { status: 401 })],
    ['400', new Response(undefined, { status: 400 })],
    ['405', new Response(undefined, { status: 405 })],
    ['a non-Response error', new Error('boom')],
  ])('rethrows a library failure that is %s', async (_name, failure) => {
    libraryWebhook.mockRejectedValue(failure);

    await expect(authenticate.webhook(webhookRequest())).rejects.toBe(failure);
  });

  describe('when the library fails with a 500 (offline token refresh failed)', () => {
    it.each([
      ['app/uninstalled', 'APP_UNINSTALLED'],
      ['shop/redact', 'SHOP_REDACT'],
      ['customers/redact', 'CUSTOMERS_REDACT'],
      ['customers/data_request', 'CUSTOMERS_DATA_REQUEST'],
    ])('authenticates %s without a session', async (wireTopic, topic) => {
      libraryWebhook.mockRejectedValue(libraryFailure());

      const context = await authenticate.webhook(webhookRequest({ topic: wireTopic }));

      expect(context).toEqual({
        shop: 'shop.myshopify.com',
        topic,
        webhookId: 'webhook-1',
        apiVersion: '2026-07',
        triggeredAt: '2026-01-02T03:04:05.000Z',
        payload: { id: 1 },
        webhookType: 'webhooks',
        session: undefined,
        admin: undefined,
      });
    });

    it('warns with the shop, topic and webhook id', async () => {
      libraryWebhook.mockRejectedValue(libraryFailure());

      await authenticate.webhook(webhookRequest());

      expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
        shop: 'shop.myshopify.com',
        topic: 'APP_UNINSTALLED',
        webhookId: 'webhook-1',
      });
    });

    it('rejects a request whose signature does not match the body with a 401', async () => {
      libraryWebhook.mockRejectedValue(libraryFailure());
      const forged = webhookRequest({
        hmac: createHmac('sha256', 'other').update(BODY).digest('base64'),
      });

      const error = await thrownBy(authenticate.webhook(forged));

      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(401);
    });

    it('rejects a signature that is not valid base64 with a 401', async () => {
      libraryWebhook.mockRejectedValue(libraryFailure());

      const error = await thrownBy(authenticate.webhook(webhookRequest({ hmac: '%%%' })));

      expect((error as Response).status).toBe(401);
    });

    it('rejects a body that was altered after signing with a 401', async () => {
      libraryWebhook.mockRejectedValue(libraryFailure());
      const signed = createHmac('sha256', SECRET).update(BODY).digest('base64');

      const error = await thrownBy(
        authenticate.webhook(webhookRequest({ body: JSON.stringify({ id: 2 }), hmac: signed })),
      );

      expect((error as Response).status).toBe(401);
    });

    it.each(['app/scopes_update', 'shop/update', 'products/create'])(
      'rethrows the 500 for %s so Shopify retries',
      async topic => {
        const failure = libraryFailure();
        libraryWebhook.mockRejectedValue(failure);

        await expect(authenticate.webhook(webhookRequest({ topic }))).rejects.toBe(failure);
        expect(logger.warn).not.toHaveBeenCalled();
      },
    );
  });
});
