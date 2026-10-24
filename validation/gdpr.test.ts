import { fromPartial } from '@total-typescript/shoehorn';
import { action as customersDataRequest } from 'app/routes/webhooks.customers.data_request';
import { action as customersRedact } from 'app/routes/webhooks.customers.redact';
import { completeGdprRequest, recordGdprRequest } from 'app/server/gdpr-request.server';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  applyMigrations,
  db,
  freezeClock,
  readGdprRequests,
  readShop,
  resetData,
  restoreClock,
  seedSession,
  seedShop,
  SHOP,
  sessionIds,
  setClock,
  T,
  webhookRequest,
} from './support/harness';
import { shopifyMock } from './support/shopify-mock';

beforeAll(applyMigrations);
beforeEach(async () => {
  await resetData();
  shopifyMock.reset();
  freezeClock(T(100));
});
afterEach(restoreClock);

const customerPayload = () => ({
  shop_id: 1001,
  shop_domain: SHOP,
  orders_to_redact: [111, 222],
  customer: { id: 191167, email: 'jane@example.com', phone: '+15555550100', name: 'kept?' },
});

function webhook(overrides: Partial<Parameters<typeof recordGdprRequest>[1]> = {}) {
  return {
    webhookId: 'wh-1',
    topic: 'CUSTOMERS_REDACT',
    payload: customerPayload(),
    triggeredAt: T(90).toISOString(),
    ...overrides,
  };
}

describe('recordGdprRequest', () => {
  it('inserts a pending row first, with the wire-form topic and payload identity fields', async () => {
    const row = await recordGdprRequest(db, webhook());

    expect(row).toEqual({
      id: 'wh-1',
      topic: 'customers/redact',
      shopId: 1001,
      shopDomain: SHOP,
      payload: expect.any(Object),
      status: 'pending',
      triggeredAt: T(90),
      createdAt: T(100),
      processedAt: null,
    });
    expect(await readGdprRequests()).toEqual([row]);
  });

  it.each([
    ['CUSTOMERS_DATA_REQUEST', 'customers/data_request'],
    ['CUSTOMERS_REDACT', 'customers/redact'],
    ['SHOP_REDACT', 'shop/redact'],
  ])('maps the library topic %s to the wire topic %s', async (topic, wire) => {
    const row = await recordGdprRequest(db, webhook({ webhookId: `id-${topic}`, topic }));
    expect(row?.topic).toBe(wire);
    expect((await readGdprRequests()).find(r => r.id === `id-${topic}`)?.topic).toBe(wire);
  });

  it.each(['APP_UNINSTALLED', 'customers/redact', 'SHOP_UPDATE', ''])(
    'rejects the non-compliance topic %j and writes nothing',
    async topic => {
      await expect(recordGdprRequest(db, webhook({ topic }))).rejects.toThrow(
        /not a mandatory compliance topic/,
      );
      expect(await readGdprRequests()).toEqual([]);
    },
  );

  it('removes customer email and phone but retains identifiers and other fields', async () => {
    const input = webhook();
    await recordGdprRequest(db, input);

    const [stored] = await readGdprRequests();
    expect(stored.payload).toEqual({
      shop_id: 1001,
      shop_domain: SHOP,
      orders_to_redact: [111, 222],
      customer: { id: 191167, name: 'kept?' },
    });
    expect(JSON.stringify(stored)).not.toContain('jane@example.com');
    expect(JSON.stringify(stored)).not.toContain('+15555550100');
    // The caller's payload is not mutated (the route may still act on it).
    expect((input.payload.customer as { email: string }).email).toBe('jane@example.com');
  });

  it('retains data_request ids and order ids', async () => {
    await recordGdprRequest(
      db,
      webhook({
        webhookId: 'dr',
        topic: 'CUSTOMERS_DATA_REQUEST',
        payload: {
          shop_id: 1001,
          shop_domain: SHOP,
          orders_requested: [1, 2],
          customer: { id: 5, email: 'a@b.c', phone: null },
          data_request: { id: 9999 },
        },
      }),
    );
    const [stored] = await readGdprRequests();
    expect(stored.payload).toEqual({
      shop_id: 1001,
      shop_domain: SHOP,
      orders_requested: [1, 2],
      customer: { id: 5 },
      data_request: { id: 9999 },
    });
  });

  it('stores a shop/redact payload (no customer) unchanged', async () => {
    const payload = { shop_id: 1001, shop_domain: SHOP };
    await recordGdprRequest(db, webhook({ webhookId: 'sr', topic: 'SHOP_REDACT', payload }));
    expect((await readGdprRequests())[0].payload).toEqual(payload);
  });

  it('falls back to receipt time when triggered-at is absent or unparseable', async () => {
    await recordGdprRequest(db, webhook({ webhookId: 'a', triggeredAt: undefined }));
    await recordGdprRequest(db, webhook({ webhookId: 'b', triggeredAt: 'garbage' }));
    const rows = await readGdprRequests();
    expect(rows.map(r => r.triggeredAt)).toEqual([T(100), T(100)]);
  });

  it.each([
    ['non-integer shop_id', { shop_id: 'abc', shop_domain: SHOP }],
    ['fractional shop_id', { shop_id: 1.5, shop_domain: SHOP }],
    ['missing shop_id', { shop_domain: SHOP }],
    ['missing shop_domain', { shop_id: 1 }],
    ['empty shop_domain', { shop_id: 1, shop_domain: '' }],
  ])('rejects a malformed identity (%s) and writes nothing', async (_name, payload) => {
    await expect(recordGdprRequest(db, webhook({ payload }))).rejects.toThrow(/Invalid shop_/);
    expect(await readGdprRequests()).toEqual([]);
  });

  it('needs no Shop row', async () => {
    expect(await readShop()).toBeUndefined();
    await expect(recordGdprRequest(db, webhook())).resolves.toMatchObject({ status: 'pending' });
  });

  describe('deduplication', () => {
    it('returns the existing pending row for a redelivery without inserting or changing it', async () => {
      const first = await recordGdprRequest(db, webhook());
      setClock(T(200));

      const again = await recordGdprRequest(db, webhook());

      expect(again).toEqual(first);
      expect(await readGdprRequests()).toHaveLength(1);
    });

    it.each(['processed', 'skipped'] as const)(
      'returns null for a request already %s, leaving it untouched',
      async status => {
        await recordGdprRequest(db, webhook());
        setClock(T(120));
        await completeGdprRequest(db, 'wh-1', status);
        const [before] = await readGdprRequests();
        setClock(T(300));

        await expect(recordGdprRequest(db, webhook())).resolves.toBeNull();

        expect((await readGdprRequests())[0]).toEqual(before);
      },
    );

    it('distinct webhook ids for the same event are separate requests', async () => {
      await recordGdprRequest(db, webhook({ webhookId: 'a' }));
      await recordGdprRequest(db, webhook({ webhookId: 'b' }));
      expect(await readGdprRequests()).toHaveLength(2);
    });

    it('concurrent deliveries of one webhook id produce a single row', async () => {
      const results = await Promise.all([
        recordGdprRequest(db, webhook()),
        recordGdprRequest(db, webhook()),
        recordGdprRequest(db, webhook()),
      ]);

      expect(await readGdprRequests()).toHaveLength(1);
      expect(results.every(r => r?.status === 'pending')).toBe(true);
    });
  });
});

describe('completeGdprRequest', () => {
  it.each(['processed', 'skipped'] as const)(
    'sets status %s and processedAt together',
    async status => {
      await recordGdprRequest(db, webhook());
      setClock(T(130));

      await completeGdprRequest(db, 'wh-1', status);

      expect((await readGdprRequests())[0]).toMatchObject({ status, processedAt: T(130) });
    },
  );

  it('leaves processedAt null while pending', async () => {
    await recordGdprRequest(db, webhook());
    expect((await readGdprRequests())[0]).toMatchObject({ status: 'pending', processedAt: null });
  });

  it('only touches the named request', async () => {
    await recordGdprRequest(db, webhook({ webhookId: 'a' }));
    await recordGdprRequest(db, webhook({ webhookId: 'b' }));

    await completeGdprRequest(db, 'a', 'processed');

    const rows = await readGdprRequests();
    expect(rows.find(r => r.id === 'a')?.status).toBe('processed');
    expect(rows.find(r => r.id === 'b')?.status).toBe('pending');
  });

  it('completing an unknown id is a harmless no-op', async () => {
    await expect(completeGdprRequest(db, 'nope', 'processed')).resolves.toBeUndefined();
    expect(await readGdprRequests()).toEqual([]);
  });
});

describe.each([
  ['customers/data_request', 'customers/data_request', customersDataRequest],
  ['customers/redact', 'customers/redact', customersRedact],
] as const)('%s route (real webhook authentication)', (topic, wire, action) => {
  const deliver = (
    options: Partial<Parameters<typeof webhookRequest>[0]> = {},
  ): ReturnType<typeof action> =>
    action(
      fromPartial({
        request: webhookRequest({
          topic,
          payload: customerPayload(),
          webhookId: 'wh-route',
          triggeredAt: T(90),
          ...options,
        }),
      }),
    );

  it('records the scrubbed request and completes it as processed when no Shop exists', async () => {
    expect(await readShop()).toBeUndefined();

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(await readGdprRequests()).toEqual([
      expect.objectContaining({
        id: 'wh-route',
        topic: wire,
        status: 'processed',
        processedAt: T(100),
        triggeredAt: T(90),
        shopId: 1001,
        shopDomain: SHOP,
        payload: expect.not.objectContaining({
          customer: expect.objectContaining({ email: expect.anything() }),
        }),
      }),
    ]);
    expect(JSON.stringify((await readGdprRequests())[0].payload)).not.toMatch(/jane@|\+1555/);
  });

  it('completes as processed with an installed Shop present, leaving the Shop and Sessions alone', async () => {
    await seedShop();
    await seedSession();

    const response = await deliver();

    expect(response.status).toBe(200);
    expect((await readGdprRequests())[0]).toMatchObject({ status: 'processed' });
    expect(await readShop()).toMatchObject({ uninstalledAt: null, name: 'Seeded Name' });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('a duplicate delivery of a processed request does nothing', async () => {
    await deliver();
    const [before] = await readGdprRequests();
    setClock(T(500));

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(await readGdprRequests()).toEqual([before]);
  });

  it('resumes a request left pending by an earlier interrupted delivery', async () => {
    await recordGdprRequest(db, {
      webhookId: 'wh-route',
      topic: topic === 'customers/redact' ? 'CUSTOMERS_REDACT' : 'CUSTOMERS_DATA_REQUEST',
      payload: customerPayload(),
      triggeredAt: T(90).toISOString(),
    });
    expect((await readGdprRequests())[0].status).toBe('pending');
    setClock(T(140));

    await deliver();

    expect(await readGdprRequests()).toHaveLength(1);
    expect((await readGdprRequests())[0]).toMatchObject({
      status: 'processed',
      processedAt: T(140),
      createdAt: T(100),
    });
  });

  it('rejects an invalid signature (401) without recording anything', async () => {
    const failure = await deliver({ secret: 'wrong' }).catch((error: unknown) => error);
    expect((failure as Response).status).toBe(401);
    expect(await readGdprRequests()).toEqual([]);
  });

  it('records and completes even when the offline token is expired and cannot be refreshed', async () => {
    const { seedExpiredSession } = await import('./support/harness');
    await seedExpiredSession();
    shopifyMock.rejectTokenRequests = true;

    const response = await deliver();

    expect(response.status).toBe(200);
    expect((await readGdprRequests())[0]).toMatchObject({ status: 'processed', topic: wire });
  });
});
