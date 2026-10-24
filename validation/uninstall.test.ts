import { fromPartial } from '@total-typescript/shoehorn';
import { action } from 'app/routes/webhooks.app.uninstalled';
import { ensureShop, uninstallShop } from 'app/server/shop.server';
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
  sessionIds,
  T,
  webhookRequest,
} from './support/harness';
import { adminReturning, shopifyMock } from './support/shopify-mock';

const OTHER = 'other.myshopify.com';

beforeAll(applyMigrations);
beforeEach(async () => {
  await resetData();
  shopifyMock.reset();
  freezeClock(T(100));
});
afterEach(restoreClock);

describe('uninstallShop', () => {
  it('marks the Shop uninstalled at the event time and deletes all of its Sessions in one go', async () => {
    await seedShop({ installedAt: T(10), name: 'Kept Metadata' });
    await seedSession(SHOP, `offline_${SHOP}`);
    await seedSession(SHOP, `${SHOP}_online_1`, { isOnline: true });
    await seedSession(OTHER);

    await expect(uninstallShop(db, SHOP, T(50))).resolves.toBe('uninstalled');

    expect(await readShop()).toMatchObject({
      uninstalledAt: T(50),
      updatedAt: T(100),
      installedAt: T(10),
      name: 'Kept Metadata',
    });
    expect(await sessionIds()).toEqual([`offline_${OTHER}`]);
  });

  it('keeps the Shop row (uninstall never deletes it) and does not touch other Shops', async () => {
    await seedShop({ installedAt: T(10) });
    await seedShop({ id: 2002, myshopifyDomain: OTHER, installedAt: T(10) });

    await uninstallShop(db, SHOP, T(50));

    expect(await readShop(OTHER)).toMatchObject({ uninstalledAt: null });
    expect(await readShops()).toHaveLength(2);
  });

  it('is idempotent for duplicate deliveries of the same event', async () => {
    await seedShop({ installedAt: T(10) });
    await seedSession();

    await expect(uninstallShop(db, SHOP, T(50))).resolves.toBe('uninstalled');
    await expect(uninstallShop(db, SHOP, T(50))).resolves.toBe('uninstalled');

    expect(await readShop()).toMatchObject({ uninstalledAt: T(50), installedAt: T(10) });
    expect(await sessionIds()).toEqual([]);
  });

  it('applies a event 1ms after installedAt (strictly later)', async () => {
    await seedShop({ installedAt: T(10) });
    await seedSession();

    await expect(uninstallShop(db, SHOP, new Date(T(10).getTime() + 1))).resolves.toBe(
      'uninstalled',
    );
    expect(await sessionIds()).toEqual([]);
  });

  it('ignores an event equal to installedAt: Shop and Sessions are untouched', async () => {
    await seedShop({ installedAt: T(10), updatedAt: T(11) });
    await seedSession();

    await expect(uninstallShop(db, SHOP, T(10))).resolves.toBe('stale');

    expect(await readShop()).toMatchObject({ uninstalledAt: null, updatedAt: T(11) });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('ignores an older event: Shop and Sessions are untouched', async () => {
    await seedShop({ installedAt: T(10), updatedAt: T(11) });
    await seedSession();

    await expect(uninstallShop(db, SHOP, T(9))).resolves.toBe('stale');

    expect(await readShop()).toMatchObject({ uninstalledAt: null, updatedAt: T(11) });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('a delayed uninstall from a previous install period does not hurt the current install', async () => {
    // Install T0, uninstall T10 processed, reinstall T30 (via the real ensureShop).
    await seedShop({ installedAt: T(0), createdAt: T(0) });
    await uninstallShop(db, SHOP, T(10));
    freezeClock(T(30));
    await ensureShop(db, SHOP, adminReturning({ name: 'Current Install' }));
    await seedSession();

    // The same event is redelivered long afterwards.
    freezeClock(T(200));
    await expect(uninstallShop(db, SHOP, T(10))).resolves.toBe('stale');

    expect(await readShop()).toMatchObject({
      name: 'Current Install',
      uninstalledAt: null,
      installedAt: T(30),
      createdAt: T(0),
    });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('a later uninstall of the current install still applies after an earlier stale one', async () => {
    await seedShop({ installedAt: T(30) });
    await seedSession();

    await expect(uninstallShop(db, SHOP, T(10))).resolves.toBe('stale');
    await expect(uninstallShop(db, SHOP, T(60))).resolves.toBe('uninstalled');

    expect(await readShop()).toMatchObject({ uninstalledAt: T(60) });
    expect(await sessionIds()).toEqual([]);
  });

  describe('missing Shop', () => {
    it('returns missing, deletes the domain Sessions and inserts nothing', async () => {
      await seedSession(SHOP, `offline_${SHOP}`);
      await seedSession(SHOP, `${SHOP}_online_1`, { isOnline: true });
      await seedSession(OTHER);

      await expect(uninstallShop(db, SHOP, T(50))).resolves.toBe('missing');

      expect(await sessionIds()).toEqual([`offline_${OTHER}`]);
      expect(await readShops()).toEqual([]);
    });

    it('is a no-op when there are no Sessions either, and repeatable', async () => {
      await expect(uninstallShop(db, SHOP, T(50))).resolves.toBe('missing');
      await expect(uninstallShop(db, SHOP, T(50))).resolves.toBe('missing');
    });
  });

  describe('reinstall between the read and the batch (SQL guards)', () => {
    // The row looked applicable when read (installedAt T10 < event T50). Before the batch runs, the
    // merchant reinstalled, so the row is installed again at `reinstalledAt`.
    async function reinstallDuringRead(reinstalledAt: Date) {
      afterShopRead(async () => {
        await d1
          .prepare('UPDATE shop SET installedAt = ?, uninstalledAt = NULL, name = ?')
          .bind(reinstalledAt.getTime(), 'Reinstalled')
          .run();
        await seedSession(SHOP, `${SHOP}_new_session`);
      });
    }

    it('reinstalled after the event: the Shop stays installed and the new Session survives', async () => {
      await seedShop({ installedAt: T(10) });
      await seedSession(SHOP, `offline_${SHOP}`);
      await reinstallDuringRead(T(70));

      await expect(uninstallShop(db, SHOP, T(50))).resolves.toBe('uninstalled');

      expect(await readShop()).toMatchObject({
        name: 'Reinstalled',
        installedAt: T(70),
        uninstalledAt: null,
      });
      expect(await sessionIds()).toEqual([`${SHOP}_new_session`, `offline_${SHOP}`].sort());
    });

    it('reinstalled at exactly the event time: equality is also protected', async () => {
      await seedShop({ installedAt: T(10) });
      await reinstallDuringRead(T(50));

      await uninstallShop(db, SHOP, T(50));

      expect(await readShop()).toMatchObject({ installedAt: T(50), uninstalledAt: null });
      expect(await sessionIds()).toEqual([`${SHOP}_new_session`]);
    });

    it('Shop created after a missing-row read: its Sessions survive the Session-only delete', async () => {
      afterShopRead(async () => {
        freezeClock(T(200));
        await ensureShop(db, SHOP, adminReturning());
        await seedSession(SHOP, `${SHOP}_new_session`);
      });

      await expect(uninstallShop(db, SHOP, T(150))).resolves.toBe('missing');

      expect(await readShop()).toMatchObject({ installedAt: T(200), uninstalledAt: null });
      expect(await sessionIds()).toEqual([`${SHOP}_new_session`]);
    });

    it('still applies when the interleaving write does not reinstall (control)', async () => {
      await seedShop({ installedAt: T(10) });
      await seedSession();
      afterShopRead(async () => {
        await d1.prepare("UPDATE shop SET name = 'Renamed'").run();
      });

      await uninstallShop(db, SHOP, T(50));

      expect(await readShop()).toMatchObject({ name: 'Renamed', uninstalledAt: T(50) });
      expect(await sessionIds()).toEqual([]);
    });
  });
});

describe('app/uninstalled route (real webhook authentication)', () => {
  const deliver = (options: Parameters<typeof webhookRequest>[0] = { topic: 'app/uninstalled' }) =>
    action(fromPartial({ request: webhookRequest({ triggeredAt: T(50), ...options }) }));

  it('uninstalls an installed Shop and removes its Sessions', async () => {
    await seedShop({ installedAt: T(10) });
    await seedSession();

    const response = await deliver({ topic: 'app/uninstalled' });

    expect(response.status).toBe(200);
    expect(await readShop()).toMatchObject({ uninstalledAt: T(50) });
    expect(await sessionIds()).toEqual([]);
  });

  it('removes Sessions with no authenticated Session (token already gone) and a missing Shop', async () => {
    // A stale-listed Session the library cannot load as the offline Session: only an online one.
    await seedSession(SHOP, `${SHOP}_online_1`, { isOnline: true });

    const response = await deliver({ topic: 'app/uninstalled' });

    expect(response.status).toBe(200);
    expect(await sessionIds()).toEqual([]);
    expect(await readShops()).toEqual([]);
  });

  it('still cleans up when the stored offline token is expired and cannot be refreshed', async () => {
    await seedShop({ installedAt: T(10) });
    await seedExpiredSession();
    shopifyMock.rejectTokenRequests = true;

    const response = await deliver({ topic: 'app/uninstalled' });

    expect(response.status).toBe(200);
    expect(shopifyMock.tokenExchangeCalls).toEqual([SHOP]);
    expect(await readShop()).toMatchObject({ uninstalledAt: T(50) });
    expect(await sessionIds()).toEqual([]);
  });

  it('does not run the fallback for an invalid signature (401), leaving data intact', async () => {
    await seedShop({ installedAt: T(10) });
    await seedExpiredSession();
    shopifyMock.rejectTokenRequests = true;

    const failure = await deliver({ topic: 'app/uninstalled', secret: 'wrong' }).catch(
      (error: unknown) => error,
    );

    expect((failure as Response).status).toBe(401);
    expect(await readShop()).toMatchObject({ uninstalledAt: null });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('ignores a stale delivery for a reinstalled Shop', async () => {
    await seedShop({ installedAt: T(80) });
    await seedSession();

    const response = await deliver({ topic: 'app/uninstalled', triggeredAt: T(50) });

    expect(response.status).toBe(200);
    expect(await readShop()).toMatchObject({ uninstalledAt: null });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('throws (so Shopify retries) when the triggered-at header is missing, deleting nothing', async () => {
    await seedShop({ installedAt: T(10) });
    await seedSession();

    await expect(deliver({ topic: 'app/uninstalled', triggeredAt: null })).rejects.toThrow(
      /Unusable X-Shopify-Triggered-At/,
    );
    expect(await readShop()).toMatchObject({ uninstalledAt: null });
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('throws on an unparseable triggered-at header, deleting nothing', async () => {
    await seedShop({ installedAt: T(10) });
    await seedSession();

    await expect(deliver({ topic: 'app/uninstalled', triggeredAt: 'not-a-date' })).rejects.toThrow(
      /Unusable X-Shopify-Triggered-At/,
    );
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('a redelivery of the same uninstall is harmless', async () => {
    await seedShop({ installedAt: T(10) });
    await seedSession();

    await deliver({ topic: 'app/uninstalled' });
    const second = await deliver({ topic: 'app/uninstalled' });

    expect(second.status).toBe(200);
    expect(await readShop()).toMatchObject({ uninstalledAt: T(50) });
  });
});
