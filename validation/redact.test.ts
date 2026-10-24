import { fromPartial } from '@total-typescript/shoehorn';
import { action } from 'app/routes/webhooks.shop.redact';
import * as gdpr from 'app/server/gdpr-request.server';
import { ensureShop, redactShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adminRequest,
  afterShopRead,
  applyMigrations,
  d1,
  db,
  freezeClock,
  readGdprRequests,
  readShop,
  readShops,
  resetData,
  restoreClock,
  seedExpiredSession,
  seedSession,
  seedShop,
  SHOP,
  sessionIds,
  setClock,
  T,
  webhookRequest,
} from './support/harness';
import { adminReturning, shopifyMock } from './support/shopify-mock';

// Wrap (not replace) the real GDPR persistence so a test can make `completeGdprRequest` fail once.
vi.mock('app/server/gdpr-request.server', async importOriginal => {
  const actual = await importOriginal<typeof gdpr>();
  return { ...actual, completeGdprRequest: vi.fn(actual.completeGdprRequest) };
});

const OTHER = 'other.myshopify.com';

beforeAll(applyMigrations);
beforeEach(async () => {
  await resetData();
  shopifyMock.reset();
  freezeClock(T(100));
});
afterEach(restoreClock);

async function seedGdprEvidence() {
  await gdpr.recordGdprRequest(db, {
    webhookId: 'earlier-customer-redact',
    topic: 'CUSTOMERS_REDACT',
    payload: { shop_id: 1001, shop_domain: SHOP, customer: { id: 7, email: 'x@y.z' } },
    triggeredAt: T(20).toISOString(),
  });
  await gdpr.completeGdprRequest(db, 'earlier-customer-redact', 'processed');
}

describe('redactShop', () => {
  it('deletes an uninstalled Shop and its Sessions only', async () => {
    await seedShop({ uninstalledAt: T(50) });
    await seedSession(SHOP, `offline_${SHOP}`);
    await seedSession(SHOP, `${SHOP}_online_1`, { isOnline: true });
    await seedShop({ id: 2002, myshopifyDomain: OTHER });
    await seedSession(OTHER);

    await expect(redactShop(db, SHOP)).resolves.toBe('redacted');

    expect(await readShop()).toBeUndefined();
    expect(await sessionIds()).toEqual([`offline_${OTHER}`]);
    expect(await readShop(OTHER)).toBeDefined();
  });

  it('handles a missing Shop: still deletes orphan Sessions, repeatably', async () => {
    await seedSession();
    await seedSession(OTHER);

    await expect(redactShop(db, SHOP)).resolves.toBe('redacted');
    await expect(redactShop(db, SHOP)).resolves.toBe('redacted');

    expect(await sessionIds()).toEqual([`offline_${OTHER}`]);
    expect(await readShops()).toEqual([]);
  });

  it('skips an installed Shop and deletes nothing', async () => {
    await seedShop();
    await seedSession();

    await expect(redactShop(db, SHOP)).resolves.toBe('skipped');

    expect(await readShop()).toMatchObject({ uninstalledAt: null, name: 'Seeded Name' });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('retains every GDPR Request row', async () => {
    await seedShop({ uninstalledAt: T(50) });
    await seedGdprEvidence();
    await gdpr.recordGdprRequest(db, {
      webhookId: 'the-redact',
      topic: 'SHOP_REDACT',
      payload: { shop_id: 1001, shop_domain: SHOP },
    });
    const before = await readGdprRequests();

    await redactShop(db, SHOP);

    expect(await readGdprRequests()).toEqual(before);
    expect(before).toHaveLength(2);
  });

  describe('reinstall between the read and the deletion batch (guarded deletes)', () => {
    async function reinstallDuringRead() {
      afterShopRead(async () => {
        freezeClock(T(300));
        // The real reinstall path: ensureShop sees the uninstalled row and snapshots again.
        await ensureShop(db, SHOP, adminReturning({ name: 'Reinstalled' }));
        await seedSession(SHOP, `${SHOP}_new_session`);
      });
    }

    it('uninstalled at read: the reinstalled Shop and its Sessions survive; still reports redacted', async () => {
      await seedShop({ uninstalledAt: T(50), createdAt: T(5) });
      await seedSession(SHOP, `offline_${SHOP}`);
      await seedGdprEvidence();
      await reinstallDuringRead();

      await expect(redactShop(db, SHOP)).resolves.toBe('redacted');

      expect(await readShop()).toMatchObject({
        name: 'Reinstalled',
        uninstalledAt: null,
        installedAt: T(300),
        createdAt: T(5),
      });
      // The pre-reinstall Session is protected too: the guard is "an installed Shop exists".
      expect(await sessionIds()).toEqual([`${SHOP}_new_session`, `offline_${SHOP}`].sort());
      expect(await readGdprRequests()).toHaveLength(1);
    });

    it('missing at read: a Shop installed before the batch keeps its Shop and Sessions', async () => {
      await reinstallDuringRead();

      await expect(redactShop(db, SHOP)).resolves.toBe('redacted');

      expect(await readShop()).toMatchObject({ name: 'Reinstalled', uninstalledAt: null });
      expect(await sessionIds()).toEqual([`${SHOP}_new_session`]);
    });

    it('control: without the interleaved reinstall the same setup is fully erased', async () => {
      await seedShop({ uninstalledAt: T(50) });
      await seedSession();

      await redactShop(db, SHOP);

      expect(await readShop()).toBeUndefined();
      expect(await sessionIds()).toEqual([]);
    });

    it('installed at read is skipped even if it is uninstalled again before the batch', async () => {
      await seedShop();
      await seedSession();
      afterShopRead(async () => {
        await d1.prepare('UPDATE shop SET uninstalledAt = ?').bind(T(120).getTime()).run();
      });

      // The decision is made at the initial read: the redaction belongs to an earlier install.
      await expect(redactShop(db, SHOP)).resolves.toBe('skipped');
      expect(await readShop()).toBeDefined();
      expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
    });
  });
});

describe('shop/redact route (real webhook authentication)', () => {
  const deliver = (options: Partial<Parameters<typeof webhookRequest>[0]> = {}) =>
    action(
      fromPartial({
        request: webhookRequest({
          topic: 'shop/redact',
          payload: { shop_id: 1001, shop_domain: SHOP },
          webhookId: 'wh-redact',
          triggeredAt: T(90),
          ...options,
        }),
      }),
    );

  it('erases an uninstalled Shop and Sessions and completes the request as processed', async () => {
    await seedShop({ uninstalledAt: T(50) });
    await seedSession();

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(await readShop()).toBeUndefined();
    expect(await sessionIds()).toEqual([]);
    expect(await readGdprRequests()).toEqual([
      expect.objectContaining({
        id: 'wh-redact',
        topic: 'shop/redact',
        status: 'processed',
        processedAt: T(100),
        shopId: 1001,
        shopDomain: SHOP,
      }),
    ]);
  });

  it('handles a missing Shop (processed) and still removes orphan Sessions', async () => {
    await seedSession();

    expect((await deliver()).status).toBe(200);
    expect(await sessionIds()).toEqual([]);
    expect((await readGdprRequests())[0]).toMatchObject({ status: 'processed' });
  });

  it('skips an installed Shop: nothing deleted, request completed as skipped', async () => {
    await seedShop();
    await seedSession();

    expect((await deliver()).status).toBe(200);

    expect(await readShop()).toMatchObject({ uninstalledAt: null });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
    expect((await readGdprRequests())[0]).toMatchObject({
      status: 'skipped',
      processedAt: T(100),
    });
  });

  it('retains previous GDPR Requests for the shop after erasure', async () => {
    await seedShop({ uninstalledAt: T(50) });
    await seedGdprEvidence();

    await deliver();

    const rows = await readGdprRequests();
    expect(rows.map(r => [r.id, r.status]).sort()).toEqual([
      ['earlier-customer-redact', 'processed'],
      ['wh-redact', 'processed'],
    ]);
  });

  it('a duplicate delivery after completion does nothing', async () => {
    await seedShop({ uninstalledAt: T(50) });
    await deliver();
    const [before] = await readGdprRequests();
    // A fresh install appears after the redaction; a late duplicate must not touch it.
    freezeClock(T(400));
    await seedShop({ id: 1001, uninstalledAt: null, installedAt: T(400) });
    await seedSession();

    expect((await deliver()).status).toBe(200);

    expect(await readGdprRequests()).toEqual([before]);
    expect(await readShop()).toBeDefined();
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('works with an expired offline token that cannot be refreshed (fallback authentication)', async () => {
    await seedShop({ uninstalledAt: T(50) });
    await seedExpiredSession();
    shopifyMock.rejectTokenRequests = true;

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(await readShop()).toBeUndefined();
    expect(await sessionIds()).toEqual([]);
    expect((await readGdprRequests())[0]).toMatchObject({ status: 'processed' });
  });

  describe('failure after successful redaction but before completion', () => {
    it('stays pending, retry repeats the deletes against the missing Shop, then completes', async () => {
      await seedShop({ uninstalledAt: T(50) });
      await seedSession();
      await seedSession(OTHER);
      vi.mocked(gdpr.completeGdprRequest).mockRejectedValueOnce(new Error('D1 hiccup'));

      // First delivery: redaction succeeds, completion fails.
      await expect(deliver()).rejects.toThrow('D1 hiccup');
      expect(await readShop()).toBeUndefined();
      expect(await sessionIds()).toEqual([`offline_${OTHER}`]);
      expect(await readGdprRequests()).toEqual([
        expect.objectContaining({ id: 'wh-redact', status: 'pending', processedAt: null }),
      ]);

      // Shopify redelivers the same webhook (same id). The Shop row is already gone.
      setClock(T(160));
      const retry = await deliver();

      expect(retry.status).toBe(200);
      expect(await readShop()).toBeUndefined();
      expect(await sessionIds()).toEqual([`offline_${OTHER}`]);
      const rows = await readGdprRequests();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'processed',
        processedAt: T(160),
        createdAt: T(100),
      });

      // A third delivery is a terminal duplicate.
      expect((await deliver()).status).toBe(200);
      expect((await readGdprRequests())[0].processedAt).toEqual(T(160));
    });

    it('a failure inside redactShop itself leaves the request pending and the data intact', async () => {
      await seedShop({ uninstalledAt: T(50) });
      await seedSession();
      const batch = vi.spyOn(db, 'batch').mockRejectedValueOnce(new Error('batch failed'));

      await expect(deliver()).rejects.toThrow('batch failed');
      expect(batch).toHaveBeenCalledTimes(1);
      expect(await readShop()).toBeDefined();
      expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
      expect((await readGdprRequests())[0]).toMatchObject({ status: 'pending' });

      // Retry (the mock was single-use) completes the erasure.
      expect((await deliver()).status).toBe(200);
      expect(await readShop()).toBeUndefined();
      expect((await readGdprRequests())[0]).toMatchObject({ status: 'processed' });
    });

    it('a later install after redaction creates a fresh Shop, not the erased one', async () => {
      await seedShop({
        uninstalledAt: T(50),
        createdAt: T(1),
        installedAt: T(1),
        name: 'Erased Merchant Data',
        email: 'erased@example.com',
      });
      await seedSession();
      vi.mocked(gdpr.completeGdprRequest).mockRejectedValueOnce(new Error('D1 hiccup'));
      await expect(deliver()).rejects.toThrow('D1 hiccup');
      await deliver();
      expect(await readShop()).toBeUndefined();

      // Merchant installs again later (real admin authentication, fresh token exchange + snapshot).
      freezeClock(T(1000));
      shopifyMock.respondWith({ name: 'Fresh Merchant', email: 'fresh@example.com' });
      const context = await authenticate.admin(adminRequest());

      expect(shopifyMock.tokenExchangeCalls).toEqual([SHOP]);
      expect(context.shop).toMatchObject({
        id: 1001,
        name: 'Fresh Merchant',
        email: 'fresh@example.com',
        createdAt: T(1000),
        installedAt: T(1000),
        uninstalledAt: null,
      });
      expect(JSON.stringify(await readShops())).not.toContain('Erased Merchant Data');
      // The redaction evidence is still there and still processed.
      expect((await readGdprRequests())[0]).toMatchObject({
        id: 'wh-redact',
        status: 'processed',
      });
    });
  });
});
