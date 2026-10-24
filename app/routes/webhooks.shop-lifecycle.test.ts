import { fromPartial } from '@total-typescript/shoehorn';
import { refreshShop, uninstallShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';
import { describe, expect, it, vi } from 'vitest';

const { logger, updateScope } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  updateScope: vi.fn(),
}));

vi.mock('app/db.server', () => ({
  db: {
    name: 'database',
    update: () => ({ set: (row: unknown) => ({ where: async () => updateScope(row) }) }),
  },
}));
vi.mock('app/lib/logger', () => ({ getLogger: () => logger }));
vi.mock('app/shopify.server', () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock('app/server/shop.server', () => ({ refreshShop: vi.fn(), uninstallShop: vi.fn() }));

const database = expect.objectContaining({ name: 'database' });
const admin = { graphql: vi.fn() };
const request = new Request('https://app.example.com/webhooks', { method: 'POST' });

describe('shop/update webhook', () => {
  const webhook = { shop: 'example.myshopify.com', topic: 'SHOP_UPDATE', payload: {} };

  async function deliver() {
    const { action } = await import('./webhooks.shop.update');
    return action(fromPartial({ request }));
  }

  it('refreshes an installed Shop and acknowledges', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial({ ...webhook, admin }));
    vi.mocked(refreshShop).mockResolvedValueOnce('refreshed');

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(refreshShop).toHaveBeenCalledWith(database, 'example.myshopify.com', admin);
    expect(logger.debug).toHaveBeenCalledWith(expect.any(String), {
      topic: 'SHOP_UPDATE',
      outcome: 'refreshed',
    });
  });

  it('acknowledges an uninstalled Shop without reviving it', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial({ ...webhook, admin }));
    vi.mocked(refreshShop).mockResolvedValueOnce('not_installed');

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(logger.info).toHaveBeenCalledWith(expect.any(String), {
      topic: 'SHOP_UPDATE',
      outcome: 'not_installed',
    });
  });

  it('acknowledges without any work when there is no Admin context', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial(webhook));

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(refreshShop).not.toHaveBeenCalled();
  });

  it('does not acknowledge when the refresh fails, so Shopify retries', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial({ ...webhook, admin }));
    vi.mocked(refreshShop).mockRejectedValueOnce(new Error('GraphQL throttled'));

    await expect(deliver()).rejects.toThrow('GraphQL throttled');
  });

  it('propagates an authentication failure without refreshing', async () => {
    const unauthorized = new Response(undefined, { status: 401 });
    vi.mocked(authenticate.webhook).mockRejectedValueOnce(unauthorized);

    await expect(deliver()).rejects.toBe(unauthorized);
    expect(refreshShop).not.toHaveBeenCalled();
  });
});

describe('app/uninstalled webhook', () => {
  const webhook = {
    shop: 'example.myshopify.com',
    topic: 'APP_UNINSTALLED',
    triggeredAt: '2026-10-24T12:00:00.000Z',
  };

  async function deliver() {
    const { action } = await import('./webhooks.app.uninstalled');
    return action(fromPartial({ request }));
  }

  it.each([
    ['uninstalled', 'debug'],
    ['stale', 'info'],
    ['missing', 'info'],
  ] as const)('acknowledges and logs a %s outcome at %s', async (outcome, level) => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial(webhook));
    vi.mocked(uninstallShop).mockResolvedValueOnce(outcome);

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(logger[level]).toHaveBeenCalledWith(expect.any(String), {
      topic: 'APP_UNINSTALLED',
      outcome,
    });
  });

  it('uninstalls using the event time, even when the context has no Session', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(
      fromPartial({ ...webhook, session: undefined }),
    );
    vi.mocked(uninstallShop).mockResolvedValueOnce('uninstalled');

    await deliver();

    expect(uninstallShop).toHaveBeenCalledWith(
      database,
      'example.myshopify.com',
      new Date('2026-10-24T12:00:00.000Z'),
    );
  });

  it.each([undefined, 'not a date'])(
    'does not acknowledge, so Shopify retries, when the event time is %s',
    async triggeredAt => {
      vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial({ ...webhook, triggeredAt }));

      await expect(deliver()).rejects.toThrow('X-Shopify-Triggered-At');
      expect(uninstallShop).not.toHaveBeenCalled();
    },
  );

  it('does not acknowledge when the cleanup fails, so Shopify retries', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial(webhook));
    vi.mocked(uninstallShop).mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(deliver()).rejects.toThrow('D1 unavailable');
  });

  it('propagates an authentication failure without cleaning up', async () => {
    const unauthorized = new Response(undefined, { status: 401 });
    vi.mocked(authenticate.webhook).mockRejectedValueOnce(unauthorized);

    await expect(deliver()).rejects.toBe(unauthorized);
    expect(uninstallShop).not.toHaveBeenCalled();
  });
});

describe('app/scopes_update webhook', () => {
  async function deliver() {
    const { action } = await import('./webhooks.app.scopes_update');
    return action(fromPartial({ request }));
  }

  it('stores the new scopes on the Session without touching the Shop', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(
      fromPartial({
        topic: 'APP_SCOPES_UPDATE',
        payload: { current: ['read_products', 'write_products'] },
        session: { id: 'offline_example.myshopify.com' },
      }),
    );

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(updateScope).toHaveBeenCalledWith({ scope: 'read_products,write_products' });
    expect(refreshShop).not.toHaveBeenCalled();
    expect(uninstallShop).not.toHaveBeenCalled();
  });

  it('acknowledges without writing when there is no Session', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue(
      fromPartial({ topic: 'APP_SCOPES_UPDATE', payload: { current: ['read_products'] } }),
    );

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(updateScope).not.toHaveBeenCalled();
  });
});
