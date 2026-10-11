import { GET_PRODUCTS } from 'app/graphql/queries';
import { type AdminApiContextWithoutRest } from 'app/shopify.server';

export async function getProducts(admin: AdminApiContextWithoutRest) {
  const response = await admin.graphql(GET_PRODUCTS, {
    variables: { first: 250 },
  });
  const responseJSON = await response.json();
  return responseJSON.data?.products.nodes ?? [];
}
