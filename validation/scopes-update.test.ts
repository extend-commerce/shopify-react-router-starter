import { fromPartial } from '@total-typescript/shoehorn';
import { action } from 'app/routes/webhooks.app.scopes_update';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  applyMigrations,
  db,
  readShops,
  resetData,
  seedExpiredSession,
  seedSession,
  seedShop,
  SHOP,
  webhookRequest,
} from './support/harness';
import { shopifyMock } from './support/shopify-mock';

beforeAll(applyMigrations);
beforeEach(async () => {
  await resetData();
  shopifyMock.reset();
});

const deliver = () =>
  action(
    fromPartial({
      request: webhookRequest({
        topic: 'app/scopes_update',
        payload: { current: ['read_products', 'write_products'] },
      }),
    }),
  );

describe('app/scopes_update route (real webhook authentication)', () => {
  it('stores the new scopes on the Session and does not write Shop data', async () => {
    await seedShop();
    await seedSession(SHOP, `offline_${SHOP}`, { scope: 'read_products' });
    const shopBefore = await readShops();

    expect((await deliver()).status).toBe(200);

    const [session] = await db.query.sessionTable.findMany();
    expect(session.scope).toBe('read_products,write_products');
    expect(await readShops()).toEqual(shopBefore);
  });

  it('acknowledges with 200 when there is no Session', async () => {
    expect((await deliver()).status).toBe(200);
    expect(await readShops()).toEqual([]);
  });

  it('is not on the fallback allowlist: an unrefreshable token keeps the 500 so it retries', async () => {
    await seedExpiredSession();
    shopifyMock.rejectTokenRequests = true;

    const failure = await deliver().catch((error: unknown) => error);

    expect((failure as Response).status).toBe(500);
  });
});
