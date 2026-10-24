import { fromPartial } from '@total-typescript/shoehorn';
import { action } from 'app/routes/webhooks.shop.update';
import { refreshShop } from 'app/server/shop.server';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  afterShopRead,
  applyMigrations,
  d1,
  db,
  freezeClock,
  readShop,
  readShops,
  resetData,
  restoreClock,
  seedExpiredSession,
  seedSession,
  seedShop,
  SHOP,
  T,
  webhookRequest,
} from './support/harness';
import {
  adminReturning,
  fakeAdmin,
  jsonResponse,
  shopifyMock,
  snapshotBody,
} from './support/shopify-mock';

beforeAll(applyMigrations);
beforeEach(async () => {
  await resetData();
  shopifyMock.reset();
  freezeClock(T(100));
});
afterEach(restoreClock);

describe('refreshShop', () => {
  it('updates the installed row from a fresh snapshot, touching only metadata and updatedAt', async () => {
    await seedShop({ installedAt: T(10), createdAt: T(5), updatedAt: T(20) });
    const admin = adminReturning({
      name: 'Renamed',
      email: 'new-owner@example.com',
      contactEmail: 'new-contact@example.com',
      shopOwnerName: 'New Owner',
      primaryDomain: 'renamed.example.com',
      countryCode: null,
      plan: 'Shopify Plus',
      shopifyPlus: true,
      partnerDevelopment: true,
    });

    await expect(refreshShop(db, SHOP, admin)).resolves.toBe('refreshed');

    expect(await readShop()).toEqual({
      id: 1001,
      myshopifyDomain: SHOP,
      name: 'Renamed',
      email: 'new-owner@example.com',
      contactEmail: 'new-contact@example.com',
      shopOwnerName: 'New Owner',
      primaryDomain: 'renamed.example.com',
      countryCode: null,
      shopifyPlan: 'Shopify Plus',
      shopifyPlus: true,
      partnerDevelopment: true,
      installedAt: T(10),
      uninstalledAt: null,
      createdAt: T(5),
      updatedAt: T(100),
    });
  });

  it('does not insert a missing row, and does not call Admin GraphQL', async () => {
    const admin = adminReturning();

    await expect(refreshShop(db, SHOP, admin)).resolves.toBe('not_installed');

    expect(admin.graphqlMock).not.toHaveBeenCalled();
    expect(await readShops()).toEqual([]);
  });

  it('does not revive or modify an uninstalled row, and does not call Admin GraphQL', async () => {
    await seedShop({ uninstalledAt: T(50), name: 'Before Uninstall', updatedAt: T(50) });
    const admin = adminReturning({ name: 'Delayed Update' });

    await expect(refreshShop(db, SHOP, admin)).resolves.toBe('not_installed');

    expect(admin.graphqlMock).not.toHaveBeenCalled();
    expect(await readShop()).toMatchObject({
      uninstalledAt: T(50),
      name: 'Before Uninstall',
      updatedAt: T(50),
    });
  });

  it('reports not_installed, writing nothing, if the Shop is uninstalled after the lookup', async () => {
    await seedShop({ name: 'Before Uninstall' });
    afterShopRead(async () => {
      await d1.prepare('UPDATE shop SET uninstalledAt = ?').bind(T(60).getTime()).run();
    });

    await expect(refreshShop(db, SHOP, adminReturning({ name: 'Too Late' }))).resolves.toBe(
      'not_installed',
    );

    expect(await readShop()).toMatchObject({ name: 'Before Uninstall', uninstalledAt: T(60) });
  });

  it('only refreshes the Shop for the webhook domain', async () => {
    await seedShop();
    await seedShop({ id: 2002, myshopifyDomain: 'other.myshopify.com', name: 'Other' });

    await refreshShop(db, SHOP, adminReturning({ name: 'Mine' }));

    expect(await readShop(SHOP)).toMatchObject({ name: 'Mine' });
    expect(await readShop('other.myshopify.com')).toMatchObject({ name: 'Other' });
  });

  describe('retryable snapshot failures', () => {
    it('throws on a GraphQL error response and leaves the row unchanged', async () => {
      await seedShop({ name: 'Unchanged', updatedAt: T(20) });
      const admin = fakeAdmin(() => jsonResponse({ errors: [{ message: 'Throttled' }] }));

      await expect(refreshShop(db, SHOP, admin)).rejects.toThrow(/Throttled/);
      expect(await readShop()).toMatchObject({ name: 'Unchanged', updatedAt: T(20) });
    });

    it('succeeds on a retry after a failure', async () => {
      await seedShop({ name: 'Unchanged' });
      await expect(
        refreshShop(
          db,
          SHOP,
          fakeAdmin(() => Promise.reject(new Error('503'))),
        ),
      ).rejects.toThrow('503');

      await expect(refreshShop(db, SHOP, adminReturning({ name: 'Retried' }))).resolves.toBe(
        'refreshed',
      );
      expect(await readShop()).toMatchObject({ name: 'Retried' });
    });
  });
});

describe('shop/update route (real webhook authentication, mocked Admin GraphQL)', () => {
  const deliver = (triggeredAt = T(90)) =>
    action(fromPartial({ request: webhookRequest({ topic: 'shop/update', triggeredAt }) }));

  it('refreshes an installed Shop through the Session-backed Admin client', async () => {
    await seedShop({ name: 'Stale Name' });
    await seedSession();
    shopifyMock.graphql = () => jsonResponse(snapshotBody({ name: 'Fresh Name' }));

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(shopifyMock.graphqlCalls).toEqual([SHOP]);
    expect(await readShop()).toMatchObject({ name: 'Fresh Name', updatedAt: T(100) });
  });

  it('returns 200 and does nothing when there is no Session (no Admin context)', async () => {
    await seedShop({ name: 'Stale Name' });

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(shopifyMock.graphqlCalls).toEqual([]);
    expect(await readShop()).toMatchObject({ name: 'Stale Name' });
  });

  it('does not insert a Shop that does not exist, even with a Session', async () => {
    await seedSession();

    expect((await deliver()).status).toBe(200);
    expect(await readShops()).toEqual([]);
  });

  it('does not revive an uninstalled Shop', async () => {
    await seedShop({ uninstalledAt: T(50), name: 'Old' });
    await seedSession();

    expect((await deliver()).status).toBe(200);
    expect(await readShop()).toMatchObject({ uninstalledAt: T(50), name: 'Old' });
    expect(shopifyMock.graphqlCalls).toEqual([]);
  });

  it('propagates a snapshot failure so Shopify retries the delivery', async () => {
    await seedShop({ name: 'Stale Name' });
    await seedSession();
    shopifyMock.graphql = () => jsonResponse({ errors: [{ message: 'upstream exploded' }] });

    await expect(deliver()).rejects.toThrow();
    expect(await readShop()).toMatchObject({ name: 'Stale Name' });
  });

  it('does not fall back on a 500 for shop/update: the retry failure is preserved', async () => {
    await seedShop({ name: 'Stale Name' });
    await seedExpiredSession();
    // Library cannot refresh the expired offline token -> bare 500 for a non-allowlisted topic.
    shopifyMock.rejectTokenRequests = true;

    const failure = await deliver().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Response);
    expect((failure as Response).status).toBe(500);
    expect(await readShop()).toMatchObject({ name: 'Stale Name' });
  });

  it('rejects an invalid signature with 401', async () => {
    const failure = await action(
      fromPartial({ request: webhookRequest({ topic: 'shop/update', secret: 'wrong-secret' }) }),
    ).catch((error: unknown) => error);

    expect((failure as Response).status).toBe(401);
  });
});
