import { type AdminApiContext as AdminApiContextWithoutRest } from '@shopify/shopify-app-react-router/server';
import { GET_PRODUCTS } from 'app/graphql/queries';

export async function getProducts(admin: AdminApiContextWithoutRest) {
  const response = await admin.graphql(GET_PRODUCTS, {
    variables: { first: 250 },
  });
  const responseJSON = await response.json();
  return responseJSON.data?.products.nodes ?? [];
}
