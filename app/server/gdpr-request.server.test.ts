import { fromPartial } from '@total-typescript/shoehorn';
import { type Database } from 'app/db.server';
import { describe, expect, it, vi } from 'vitest';

import { type GdprRequest, completeGdprRequest, recordGdprRequest } from './gdpr-request.server';

vi.mock('app/db.server', () => ({ db: {} }));

// Stands in for the Drizzle handle: `inserted` is what an insert that did not conflict returns
// (nothing on conflict), `existing` is what the follow-up lookup finds. The real conflict and
// update behavior is covered by the throwaway local-D1 validation, not these tests.
function fakeDatabase({
  inserted = [],
  existing = [],
}: {
  inserted?: Partial<GdprRequest>[];
  existing?: Partial<GdprRequest>[];
}) {
  const values = vi.fn();
  const set = vi.fn();
  const database = fromPartial<Database>({
    insert: () => ({
      values: (row: unknown) => {
        values(row);
        return { onConflictDoNothing: () => ({ returning: async () => inserted }) };
      },
    }),
    select: () => ({ from: () => ({ where: async () => existing }) }),
    update: () => ({
      set: (row: unknown) => {
        set(row);
        return { where: async () => undefined };
      },
    }),
  });
  return { database, values, set };
}

const customerPayload = {
  shop_id: 954889,
  shop_domain: 'example.myshopify.com',
  customer: { id: 191167, email: 'john@example.com', phone: '555-625-1199' },
  orders_to_redact: [299938, 280263],
};

const webhook = {
  webhookId: 'webhook-1',
  topic: 'CUSTOMERS_REDACT',
  payload: customerPayload,
  triggeredAt: '2026-10-24T12:00:00.000Z',
};

describe('recordGdprRequest', () => {
  it('stores the payload without customer email and phone but keeps the IDs', async () => {
    const { database, values } = fakeDatabase({ inserted: [{ id: 'webhook-1' }] });

    await recordGdprRequest(database, webhook);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          shop_id: 954889,
          shop_domain: 'example.myshopify.com',
          customer: { id: 191167 },
          orders_to_redact: [299938, 280263],
        },
      }),
    );
  });

  it('does not modify the webhook payload it was given', async () => {
    const { database } = fakeDatabase({ inserted: [{ id: 'webhook-1' }] });

    await recordGdprRequest(database, webhook);

    expect(webhook.payload.customer.email).toBe('john@example.com');
  });

  it('stores a payload with no customer as it is', async () => {
    const { database, values } = fakeDatabase({ inserted: [{ id: 'webhook-1' }] });
    const payload = { shop_id: 954889, shop_domain: 'example.myshopify.com' };

    await recordGdprRequest(database, { ...webhook, topic: 'SHOP_REDACT', payload });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ payload }));
  });

  it.each([
    ['CUSTOMERS_DATA_REQUEST', 'customers/data_request'],
    ['CUSTOMERS_REDACT', 'customers/redact'],
    ['SHOP_REDACT', 'shop/redact'],
  ])('stores %s as %s', async (topic, wireTopic) => {
    const { database, values } = fakeDatabase({ inserted: [{ id: 'webhook-1' }] });

    await recordGdprRequest(database, { ...webhook, topic });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'webhook-1',
        topic: wireTopic,
        shopId: 954889,
        shopDomain: 'example.myshopify.com',
        triggeredAt: new Date('2026-10-24T12:00:00.000Z'),
      }),
    );
  });

  it('rejects a topic that is not a mandatory compliance topic', async () => {
    const { database, values } = fakeDatabase({});

    await expect(
      recordGdprRequest(database, { ...webhook, topic: 'APP_UNINSTALLED' }),
    ).rejects.toThrow('APP_UNINSTALLED');
    expect(values).not.toHaveBeenCalled();
  });

  it('returns the newly inserted pending row', async () => {
    const row = { id: 'webhook-1', status: 'pending' } as const;
    const { database } = fakeDatabase({ inserted: [row] });

    await expect(recordGdprRequest(database, webhook)).resolves.toEqual(row);
  });

  it('returns an existing row that is still pending', async () => {
    const row = { id: 'webhook-1', status: 'pending' } as const;
    const { database } = fakeDatabase({ existing: [row] });

    await expect(recordGdprRequest(database, webhook)).resolves.toEqual(row);
  });

  it.each(['processed', 'skipped'] as const)('returns null for a %s duplicate', async status => {
    const { database } = fakeDatabase({ existing: [{ id: 'webhook-1', status }] });

    await expect(recordGdprRequest(database, webhook)).resolves.toBeNull();
  });
});

describe('completeGdprRequest', () => {
  it('sets the status together with the completion time', async () => {
    const { database, set } = fakeDatabase({});

    await completeGdprRequest(database, 'webhook-1', 'skipped');

    expect(set).toHaveBeenCalledWith({ status: 'skipped', processedAt: expect.any(Date) });
  });
});
