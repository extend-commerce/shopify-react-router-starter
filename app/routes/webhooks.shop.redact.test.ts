import { fromPartial } from '@total-typescript/shoehorn';
import { completeGdprRequest, recordGdprRequest } from 'app/server/gdpr-request.server';
import { redactShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action } from './webhooks.shop.redact';

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn() } }));

vi.mock('app/db.server', () => ({ db: { name: 'database' } }));
vi.mock('app/lib/logger', () => ({ getLogger: () => logger }));
vi.mock('app/shopify.server', () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock('app/server/gdpr-request.server', () => ({
  recordGdprRequest: vi.fn(),
  completeGdprRequest: vi.fn(),
}));
vi.mock('app/server/shop.server', () => ({ redactShop: vi.fn() }));

const webhook = {
  shop: 'example.myshopify.com',
  topic: 'SHOP_REDACT',
  webhookId: 'webhook-1',
  payload: { shop_id: 1, shop_domain: 'example.myshopify.com' },
};
const pendingRequest = fromPartial<NonNullable<Awaited<ReturnType<typeof recordGdprRequest>>>>({
  id: 'webhook-1',
  status: 'pending',
});

describe('shop/redact webhook', () => {
  const request = new Request('https://app.example.com/webhooks/shop/redact', { method: 'POST' });

  beforeEach(() => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial(webhook));
  });

  function deliver() {
    return action(fromPartial({ request }));
  }

  it('redacts the Shop and completes the request as processed', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(pendingRequest);
    vi.mocked(redactShop).mockResolvedValueOnce('redacted');

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(recordGdprRequest).toHaveBeenCalledWith({ name: 'database' }, fromPartial(webhook));
    expect(redactShop).toHaveBeenCalledWith({ name: 'database' }, 'example.myshopify.com');
    expect(completeGdprRequest).toHaveBeenCalledWith(
      { name: 'database' },
      'webhook-1',
      'processed',
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Redacted Shop',
      expect.objectContaining({ outcome: 'redacted' }),
    );
  });

  it('completes the request as skipped when the Shop is installed', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(pendingRequest);
    vi.mocked(redactShop).mockResolvedValueOnce('skipped');

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(completeGdprRequest).toHaveBeenCalledWith({ name: 'database' }, 'webhook-1', 'skipped');
    expect(logger.info).toHaveBeenCalledWith(
      'Skipped redaction of an installed Shop',
      expect.objectContaining({ outcome: 'skipped' }),
    );
    expect(logger.info).not.toHaveBeenCalledWith('Redacted Shop', expect.anything());
  });

  it('continues a request that is still pending from an earlier delivery', async () => {
    // recordGdprRequest returns the existing row for a pending request, same as a new one.
    vi.mocked(recordGdprRequest).mockResolvedValueOnce({ ...pendingRequest, status: 'pending' });
    vi.mocked(redactShop).mockResolvedValueOnce('redacted');

    await deliver();

    expect(redactShop).toHaveBeenCalledTimes(1);
    expect(completeGdprRequest).toHaveBeenCalledTimes(1);
    expect(completeGdprRequest).toHaveBeenCalledWith(
      { name: 'database' },
      'webhook-1',
      'processed',
    );
  });

  it('acknowledges a terminal duplicate without redacting or completing again', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(null);

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(redactShop).not.toHaveBeenCalled();
    expect(completeGdprRequest).not.toHaveBeenCalled();
  });

  it('does not complete the request when redaction fails, leaving it pending', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(pendingRequest);
    vi.mocked(redactShop).mockRejectedValueOnce(new Error('D1 batch failed'));

    await expect(deliver()).rejects.toThrow('D1 batch failed');
    expect(completeGdprRequest).not.toHaveBeenCalled();
  });

  it('does not acknowledge when completing fails after redaction, leaving it pending', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(pendingRequest);
    vi.mocked(redactShop).mockResolvedValueOnce('redacted');
    vi.mocked(completeGdprRequest).mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(deliver()).rejects.toThrow('D1 unavailable');
    expect(redactShop).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge when recording the request fails', async () => {
    vi.mocked(recordGdprRequest).mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(deliver()).rejects.toThrow('D1 unavailable');
    expect(redactShop).not.toHaveBeenCalled();
    expect(completeGdprRequest).not.toHaveBeenCalled();
  });

  it('propagates an authentication failure before recording anything', async () => {
    const unauthorized = new Response(undefined, { status: 401 });
    vi.mocked(authenticate.webhook).mockRejectedValueOnce(unauthorized);

    await expect(deliver()).rejects.toBe(unauthorized);
    expect(recordGdprRequest).not.toHaveBeenCalled();
    expect(redactShop).not.toHaveBeenCalled();
  });
});
