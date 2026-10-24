import { fromPartial } from '@total-typescript/shoehorn';
import { completeGdprRequest, recordGdprRequest } from 'app/server/gdpr-request.server';
import { authenticate } from 'app/shopify.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('app/db.server', () => ({ db: { name: 'database' } }));
vi.mock('app/shopify.server', () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock('app/server/gdpr-request.server', () => ({
  recordGdprRequest: vi.fn(),
  completeGdprRequest: vi.fn(),
}));

const routes = [
  ['customers/redact', () => import('./webhooks.customers.redact')],
  ['customers/data_request', () => import('./webhooks.customers.data_request')],
] as const;

const webhook = {
  shop: 'example.myshopify.com',
  topic: 'CUSTOMERS_REDACT',
  webhookId: 'webhook-1',
  payload: {},
};
const pendingRequest = fromPartial<NonNullable<Awaited<ReturnType<typeof recordGdprRequest>>>>({
  id: 'webhook-1',
  status: 'pending',
});

describe.each(routes)('%s webhook', (_topic, loadRoute) => {
  const request = new Request('https://app.example.com/webhooks', { method: 'POST' });

  beforeEach(() => {
    vi.mocked(authenticate.webhook).mockResolvedValue(fromPartial(webhook));
  });

  async function deliver() {
    const { action } = await loadRoute();
    return action(fromPartial({ request }));
  }

  it('completes a new request as processed and acknowledges it', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(pendingRequest);

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(recordGdprRequest).toHaveBeenCalledWith({ name: 'database' }, fromPartial(webhook));
    expect(completeGdprRequest).toHaveBeenCalledWith(
      { name: 'database' },
      'webhook-1',
      'processed',
    );
  });

  it('continues a request that is still pending from an earlier delivery', async () => {
    // recordGdprRequest returns the existing row for a pending request, same as a new one.
    vi.mocked(recordGdprRequest).mockResolvedValueOnce({ ...pendingRequest, status: 'pending' });

    await deliver();

    expect(completeGdprRequest).toHaveBeenCalledTimes(1);
    expect(completeGdprRequest).toHaveBeenCalledWith(
      { name: 'database' },
      'webhook-1',
      'processed',
    );
  });

  it('acknowledges a terminal duplicate without doing any further work', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(null);

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(completeGdprRequest).not.toHaveBeenCalled();
  });

  it('does not acknowledge when recording the request fails', async () => {
    vi.mocked(recordGdprRequest).mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(deliver()).rejects.toThrow('D1 unavailable');
    expect(completeGdprRequest).not.toHaveBeenCalled();
  });

  it('does not acknowledge when completing the request fails, leaving it pending', async () => {
    vi.mocked(recordGdprRequest).mockResolvedValueOnce(pendingRequest);
    vi.mocked(completeGdprRequest).mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(deliver()).rejects.toThrow('D1 unavailable');
  });

  it('propagates an authentication failure before recording anything', async () => {
    const unauthorized = new Response(undefined, { status: 401 });
    vi.mocked(authenticate.webhook).mockRejectedValueOnce(unauthorized);

    await expect(deliver()).rejects.toBe(unauthorized);
    expect(recordGdprRequest).not.toHaveBeenCalled();
  });
});
