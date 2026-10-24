import { fromPartial } from '@total-typescript/shoehorn';
import { type Database } from 'app/db.server';
import { type AdminApiContextWithoutRest } from 'app/shopify.server';
import { describe, expect, it, vi } from 'vitest';

import { type Shop, refreshShop, uninstallShop } from './shop.server';

vi.mock('app/db.server', () => ({ db: {} }));

// Stands in for the Drizzle handle. `existing` is what the Shop lookup finds and `updated` is what
// an UPDATE ... RETURNING reports. The real SQL (predicates, batch atomicity) is covered by the
// throwaway local-D1 validation, not these tests.
function fakeDatabase({
  existing,
  updated = [{ id: 1 }],
}: {
  existing?: Partial<Shop>;
  updated?: unknown[];
}) {
  const calls = {
    shopSet: vi.fn(),
    sessionDeletes: vi.fn(),
    batch: vi.fn(),
  };
  const database = fromPartial<Database>({
    query: { shopTable: { findFirst: async () => existing } },
    update: () => ({
      set: (row: unknown) => {
        calls.shopSet(row);
        return { where: () => ({ returning: async () => updated, kind: 'shop-update' }) };
      },
    }),
    delete: () => ({
      where: () => {
        calls.sessionDeletes();
        return { kind: 'session-delete', then: undefined };
      },
    }),
    batch: async (statements: unknown[]) => calls.batch(statements),
  });
  return { database, ...calls };
}

const snapshot = {
  data: {
    shop: {
      id: 'gid://shopify/Shop/1',
      name: 'New name',
      email: 'owner@example.com',
      contactEmail: 'contact@example.com',
      shopOwnerName: 'Jane Owner',
      primaryDomain: { host: 'example.com' },
      billingAddress: { countryCodeV2: 'CA' },
      plan: { publicDisplayName: 'Basic', shopifyPlus: false, partnerDevelopment: false },
    },
  },
};

function fakeAdmin(body: unknown = snapshot) {
  const graphql = vi.fn(async () => Response.json(body));
  return { admin: fromPartial<AdminApiContextWithoutRest>({ graphql }), graphql };
}

const installedAt = new Date('2026-10-01T00:00:00.000Z');

describe('refreshShop', () => {
  it('writes fresh metadata to an installed Shop', async () => {
    const { database, shopSet } = fakeDatabase({ existing: { id: 1, installedAt } });
    const { admin } = fakeAdmin();

    await expect(refreshShop(database, 'example.myshopify.com', admin)).resolves.toBe('refreshed');

    expect(shopSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New name',
        primaryDomain: 'example.com',
        countryCode: 'CA',
        updatedAt: expect.any(Date),
      }),
    );
    expect(shopSet).not.toHaveBeenCalledWith(expect.objectContaining({ uninstalledAt: null }));
  });

  it.each([
    ['has no row', undefined],
    ['is uninstalled', { id: 1, installedAt, uninstalledAt: new Date('2026-10-02T00:00:00.000Z') }],
  ])('does nothing, not even a snapshot, when the Shop %s', async (_case, existing) => {
    const { database, shopSet } = fakeDatabase({ existing });
    const { admin, graphql } = fakeAdmin();

    await expect(refreshShop(database, 'example.myshopify.com', admin)).resolves.toBe(
      'not_installed',
    );

    expect(graphql).not.toHaveBeenCalled();
    expect(shopSet).not.toHaveBeenCalled();
  });

  it('reports not_installed when the Shop is uninstalled between the lookup and the write', async () => {
    const { database } = fakeDatabase({ existing: { id: 1, installedAt }, updated: [] });
    const { admin } = fakeAdmin();

    await expect(refreshShop(database, 'example.myshopify.com', admin)).resolves.toBe(
      'not_installed',
    );
  });

  it('fails, writing nothing, when the snapshot has no Shop', async () => {
    const { database, shopSet } = fakeDatabase({ existing: { id: 1, installedAt } });
    const { admin } = fakeAdmin({ errors: [{ message: 'Throttled' }] });

    await expect(refreshShop(database, 'example.myshopify.com', admin)).rejects.toThrow(
      'Throttled',
    );
    expect(shopSet).not.toHaveBeenCalled();
  });
});

describe('uninstallShop', () => {
  const domain = 'example.myshopify.com';

  it('marks an installed Shop uninstalled at the event time and deletes its Sessions in one batch', async () => {
    const { database, shopSet, batch } = fakeDatabase({ existing: { id: 1, installedAt } });
    const triggeredAt = new Date('2026-10-02T00:00:00.000Z');

    await expect(uninstallShop(database, domain, triggeredAt)).resolves.toBe('uninstalled');

    expect(shopSet).toHaveBeenCalledWith({
      uninstalledAt: triggeredAt,
      updatedAt: expect.any(Date),
    });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it.each([
    ['equal to', installedAt],
    ['older than', new Date('2026-09-30T00:00:00.000Z')],
  ])(
    'ignores an event %s the install time, preserving the Shop and Sessions',
    async (_case, triggeredAt) => {
      const { database, shopSet, batch, sessionDeletes } = fakeDatabase({
        existing: { id: 1, installedAt },
      });

      await expect(uninstallShop(database, domain, triggeredAt)).resolves.toBe('stale');

      expect(shopSet).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
      expect(sessionDeletes).not.toHaveBeenCalled();
    },
  );

  it('still deletes the Sessions when there is no Shop row', async () => {
    const { database, shopSet, batch, sessionDeletes } = fakeDatabase({ existing: undefined });

    await expect(uninstallShop(database, domain, new Date())).resolves.toBe('missing');

    expect(sessionDeletes).toHaveBeenCalledTimes(1);
    expect(shopSet).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('repeats an applicable uninstall with the same result', async () => {
    const { database } = fakeDatabase({
      existing: { id: 1, installedAt, uninstalledAt: new Date('2026-10-02T00:00:00.000Z') },
    });
    const triggeredAt = new Date('2026-10-02T00:00:00.000Z');

    await expect(uninstallShop(database, domain, triggeredAt)).resolves.toBe('uninstalled');
    await expect(uninstallShop(database, domain, triggeredAt)).resolves.toBe('uninstalled');
  });

  it('fails when the batch fails, so the delivery is retried', async () => {
    const { database, batch } = fakeDatabase({ existing: { id: 1, installedAt } });
    batch.mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(
      uninstallShop(database, domain, new Date('2026-10-02T00:00:00.000Z')),
    ).rejects.toThrow('D1 unavailable');
  });
});
