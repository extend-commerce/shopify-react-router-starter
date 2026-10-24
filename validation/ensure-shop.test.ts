import { ensureShop, getShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  adminRequest,
  afterShopRead,
  applyMigrations,
  d1,
  db,
  freezeClock,
  readShop,
  readShops,
  resetData,
  restoreClock,
  seedSession,
  seedShop,
  SHOP,
  sessionIds,
  setClock,
  T,
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

describe('ensureShop', () => {
  it('first install: snapshots, inserts, and sets createdAt = installedAt = now', async () => {
    const admin = adminReturning({ id: 5150, name: 'First Shop', countryCode: 'DE' });

    const shop = await ensureShop(db, SHOP, admin);

    expect(admin.graphqlMock).toHaveBeenCalledTimes(1);
    expect(shop).toEqual({
      id: 5150,
      myshopifyDomain: SHOP,
      name: 'First Shop',
      email: 'owner@example.com',
      contactEmail: 'contact@example.com',
      shopOwnerName: 'Olivia Owner',
      primaryDomain: 'example.com',
      countryCode: 'DE',
      shopifyPlan: 'Basic',
      shopifyPlus: false,
      partnerDevelopment: false,
      installedAt: T(100),
      uninstalledAt: null,
      createdAt: T(100),
      updatedAt: T(100),
    });
    expect(await readShop()).toEqual(shop);
  });

  it('maps the snapshot: GID to numeric ID, plan flags to booleans, null country to null', async () => {
    const shop = await ensureShop(
      db,
      SHOP,
      adminReturning({
        id: 9007199254,
        countryCode: null,
        plan: 'Shopify Plus',
        shopifyPlus: true,
        partnerDevelopment: true,
        primaryDomain: 'store.example.org',
      }),
    );

    expect(shop).toMatchObject({
      id: 9007199254,
      countryCode: null,
      shopifyPlan: 'Shopify Plus',
      shopifyPlus: true,
      partnerDevelopment: true,
      primaryDomain: 'store.example.org',
    });
  });

  it('lazy initialization: a Shop with Sessions but no row gets one, Sessions untouched', async () => {
    await seedSession();

    const shop = await ensureShop(db, SHOP, adminReturning());

    expect(shop.installedAt).toEqual(T(100));
    expect(await sessionIds()).toEqual([`offline_${SHOP}`]);
  });

  it('already installed: returns the stored row without any Admin GraphQL call', async () => {
    await seedShop({ name: 'Stored Name', installedAt: T(1), updatedAt: T(2) });
    const admin = adminReturning({ name: 'Would Overwrite' });

    const shop = await ensureShop(db, SHOP, admin);

    expect(admin.graphqlMock).not.toHaveBeenCalled();
    expect(shop).toMatchObject({ name: 'Stored Name', installedAt: T(1), updatedAt: T(2) });
    expect((await readShop())?.name).toBe('Stored Name');
  });

  it('reinstall: refreshes metadata, clears uninstalledAt, advances installedAt, keeps createdAt', async () => {
    await seedShop({
      name: 'Old Name',
      shopifyPlan: 'Grow',
      installedAt: T(10),
      uninstalledAt: T(50),
      createdAt: T(10),
      updatedAt: T(50),
    });

    const shop = await ensureShop(db, SHOP, adminReturning({ name: 'New Name', plan: 'Advanced' }));

    expect(shop).toMatchObject({
      name: 'New Name',
      shopifyPlan: 'Advanced',
      installedAt: T(100),
      uninstalledAt: null,
      createdAt: T(10),
      updatedAt: T(100),
    });
    expect(await readShops()).toHaveLength(1);
  });

  it('reinstall after a previous reinstall keeps advancing installedAt each cycle', async () => {
    await ensureShop(db, SHOP, adminReturning());
    await d1.prepare('UPDATE shop SET uninstalledAt = ?').bind(T(110).getTime()).run();
    setClock(T(120));

    const shop = await ensureShop(db, SHOP, adminReturning());

    expect(shop).toMatchObject({ installedAt: T(120), createdAt: T(100), uninstalledAt: null });
  });

  it('updates the domain when the same Shop ID is seen under a new myshopify domain', async () => {
    await seedShop({ myshopifyDomain: 'old-name.myshopify.com', uninstalledAt: T(5) });

    const shop = await ensureShop(db, 'new-name.myshopify.com', adminReturning());

    expect(shop.myshopifyDomain).toBe('new-name.myshopify.com');
    expect(await readShops()).toHaveLength(1);
  });

  it('getShop returns the row, including uninstalled ones, and undefined when absent', async () => {
    expect(await getShop(db, SHOP)).toBeUndefined();
    await seedShop({ uninstalledAt: T(5) });
    expect(await getShop(db, SHOP)).toMatchObject({ uninstalledAt: T(5) });
    expect(await getShop(db, 'other.myshopify.com')).toBeUndefined();
  });

  describe('snapshot failure', () => {
    it('throws with the GraphQL errors when the response has no shop, and writes nothing', async () => {
      const admin = fakeAdmin(() =>
        jsonResponse({
          data: null,
          errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
        }),
      );

      await expect(ensureShop(db, SHOP, admin)).rejects.toThrow(/Throttled/);
      expect(await readShops()).toEqual([]);
    });

    it('throws when the response is a bare body without data or errors', async () => {
      await expect(
        ensureShop(
          db,
          SHOP,
          fakeAdmin(() => jsonResponse({})),
        ),
      ).rejects.toThrow(/Failed to fetch the Shop snapshot/);
      expect(await readShops()).toEqual([]);
    });

    it('throws on a malformed Shop GID instead of storing a bad ID', async () => {
      const body = snapshotBody();
      body.data.shop.id = 'gid://shopify/Product/12';
      await expect(
        ensureShop(
          db,
          SHOP,
          fakeAdmin(() => jsonResponse(body)),
        ),
      ).rejects.toThrow(/Unexpected Shop GID/);
      expect(await readShops()).toEqual([]);
    });

    it('propagates a transport error from the Admin client', async () => {
      const admin = fakeAdmin(() => Promise.reject(new Error('network down')));
      await expect(ensureShop(db, SHOP, admin)).rejects.toThrow('network down');
    });

    it('leaves an uninstalled row uninstalled when the reinstall snapshot fails, then recovers', async () => {
      await seedShop({ uninstalledAt: T(50), installedAt: T(10), name: 'Old Name' });
      const failing = fakeAdmin(() => jsonResponse({ errors: [{ message: 'boom' }] }));

      await expect(ensureShop(db, SHOP, failing)).rejects.toThrow(/boom/);
      expect(await readShop()).toMatchObject({ uninstalledAt: T(50), name: 'Old Name' });

      const shop = await ensureShop(db, SHOP, adminReturning({ name: 'Recovered' }));
      expect(shop).toMatchObject({ name: 'Recovered', uninstalledAt: null, installedAt: T(100) });
    });
  });

  describe('concurrent initialization', () => {
    // Both callers read "no installed Shop" before either writes, then upsert on the same ID.
    function bothReadBeforeEitherWrites() {
      let arrived = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => (release = resolve));
      return afterShopRead(async () => {
        arrived += 1;
        if (arrived === 2) release();
        await gate;
      }, 2);
    }

    it('first install: one row; the later upsert refreshes metadata but not the install period', async () => {
      bothReadBeforeEitherWrites();
      const first = ensureShop(db, SHOP, adminReturning({ name: 'First Writer' }));
      const second = ensureShop(
        db,
        SHOP,
        fakeAdmin(async () => {
          await first; // second writer upserts strictly after the first one committed
          setClock(T(105));
          return jsonResponse(snapshotBody({ name: 'Second Writer' }));
        }),
      );

      const [a, b] = await Promise.all([first, second]);

      expect(a.installedAt).toEqual(T(100));
      expect(b).toMatchObject({
        name: 'Second Writer',
        installedAt: T(100),
        createdAt: T(100),
        updatedAt: T(105),
        uninstalledAt: null,
      });
      expect(await readShops()).toHaveLength(1);
      expect(await readShop()).toMatchObject({ installedAt: T(100), createdAt: T(100) });
    });

    it('reinstall: only the first concurrent upsert moves installedAt; createdAt is preserved', async () => {
      await seedShop({ installedAt: T(10), uninstalledAt: T(50), createdAt: T(10) });
      bothReadBeforeEitherWrites();
      const first = ensureShop(db, SHOP, adminReturning());
      const second = ensureShop(
        db,
        SHOP,
        fakeAdmin(async () => {
          await first;
          setClock(T(105));
          return jsonResponse(snapshotBody());
        }),
      );

      await Promise.all([first, second]);

      expect(await readShop()).toMatchObject({
        installedAt: T(100),
        createdAt: T(10),
        uninstalledAt: null,
        updatedAt: T(105),
      });
    });

    it('truly parallel first loads (no ordering control) still end with exactly one row', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => ensureShop(db, SHOP, adminReturning())),
      );

      expect(new Set(results.map(r => r.id))).toEqual(new Set([1001]));
      expect(await readShops()).toHaveLength(1);
      expect(await readShop()).toMatchObject({ installedAt: T(100), createdAt: T(100) });
    });
  });
});

describe('authenticate.admin wrapper (real Shopify library, mocked Admin GraphQL)', () => {
  it('first install: token exchange stores a Session, the Shop row is created and exposed as shop', async () => {
    shopifyMock.respondWith({ id: 777, name: 'Wrapper Shop' });

    const context = await authenticate.admin(adminRequest());

    expect(shopifyMock.tokenExchangeCalls).toEqual([SHOP]);
    expect(context.session.shop).toBe(SHOP);
    expect(context.shop).toMatchObject({
      id: 777,
      name: 'Wrapper Shop',
      installedAt: T(100),
      uninstalledAt: null,
    });
    expect(await readShop()).toEqual(context.shop);
    expect(await sessionIds(SHOP)).toEqual([`offline_${SHOP}`]);
  });

  it('a later admin request returns the stored row with no further snapshot', async () => {
    await authenticate.admin(adminRequest());
    const before = shopifyMock.graphqlCalls.length;

    const context = await authenticate.admin(adminRequest());

    expect(shopifyMock.graphqlCalls.length).toBe(before);
    expect(context.shop.id).toBe(1001);
    expect(await readShops()).toHaveLength(1);
  });

  it('lazy initialization: an existing Session without a Shop row is backfilled on the next load', async () => {
    await seedSession();

    const context = await authenticate.admin(adminRequest());

    expect(shopifyMock.tokenExchangeCalls).toEqual([]);
    expect(shopifyMock.graphqlCalls).toEqual([SHOP]);
    expect(context.shop).toMatchObject({ myshopifyDomain: SHOP, uninstalledAt: null });
  });

  it('reinstall: an uninstalled row is refreshed with a new install period', async () => {
    await seedShop({ installedAt: T(10), uninstalledAt: T(50), createdAt: T(10), name: 'Old' });
    shopifyMock.respondWith({ name: 'Back Again' });

    const context = await authenticate.admin(adminRequest());

    expect(context.shop).toMatchObject({
      name: 'Back Again',
      installedAt: T(100),
      uninstalledAt: null,
      createdAt: T(10),
    });
  });

  it('snapshot failure fails the admin request and creates no Shop', async () => {
    shopifyMock.graphql = () => jsonResponse({ errors: [{ message: 'upstream exploded' }] });

    await expect(authenticate.admin(adminRequest())).rejects.toThrow();
    expect(await readShops()).toEqual([]);
  });

  it('a failed first load can be retried and then succeeds', async () => {
    shopifyMock.graphql = () => jsonResponse({ errors: [{ message: 'upstream exploded' }] });
    await expect(authenticate.admin(adminRequest())).rejects.toThrow();

    shopifyMock.reset();
    const context = await authenticate.admin(adminRequest());

    expect(context.shop.id).toBe(1001);
  });
});
