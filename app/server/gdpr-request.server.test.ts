import { fromPartial } from '@total-typescript/shoehorn';
import { type Database } from 'app/db.server';
import { describe, expect, it } from 'vitest';

import { recordGdprRequest } from './gdpr-request.server';

// Payload validation runs before the database is touched, so these tests hand in an inert handle:
// any attempt to use it would throw a TypeError instead of the expected message.
const db = fromPartial<Database>({});

const webhook = {
  webhookId: 'webhook-1',
  topic: 'CUSTOMERS_REDACT',
  payload: { shop_id: 1, shop_domain: 'example.myshopify.com' },
};

describe('recordGdprRequest payload validation', () => {
  it.each([
    ['missing', undefined],
    ['not a number', '123'],
    ['not finite', Number.NaN],
    ['not an integer', 1.5],
  ])('rejects a shop_id that is %s', async (_case, shopId) => {
    await expect(
      recordGdprRequest(db, { ...webhook, payload: { ...webhook.payload, shop_id: shopId } }),
    ).rejects.toThrow('shop_id');
  });

  it.each([
    ['missing', undefined],
    ['not a string', 42],
    ['empty', ''],
  ])('rejects a shop_domain that is %s', async (_case, shopDomain) => {
    await expect(
      recordGdprRequest(db, {
        ...webhook,
        payload: { ...webhook.payload, shop_domain: shopDomain },
      }),
    ).rejects.toThrow('shop_domain');
  });
});
