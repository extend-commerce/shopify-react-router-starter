import { fromPartial } from '@total-typescript/shoehorn';
import { GET_PRODUCTS } from 'app/graphql/queries';
import { type AdminApiContextWithoutRest } from 'app/shopify.server';
import { describe, expect, it, vi } from 'vitest';
import { getProducts } from './products.server';

function mockAdmin(body: unknown) {
  const graphql = vi.fn(async () => Response.json(body));
  return { admin: fromPartial<AdminApiContextWithoutRest>({ graphql }), graphql };
}

describe('getProducts', () => {
  it('requests the first 250 products', async () => {
    const { admin, graphql } = mockAdmin({ data: { products: { nodes: [] } } });

    await getProducts(admin);

    expect(graphql).toHaveBeenCalledWith(GET_PRODUCTS, { variables: { first: 250 } });
  });

  it('returns the product nodes', async () => {
    const nodes = [{ id: 'gid://shopify/Product/1', title: 'Snowboard' }];
    const { admin } = mockAdmin({ data: { products: { nodes } } });

    await expect(getProducts(admin)).resolves.toEqual(nodes);
  });

  it('returns an empty list when the response has no data', async () => {
    const { admin } = mockAdmin({ errors: [{ message: 'Throttled' }] });

    await expect(getProducts(admin)).resolves.toEqual([]);
  });
});
