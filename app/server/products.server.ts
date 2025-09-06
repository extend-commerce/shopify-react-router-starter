import { type AdminApiContextWithoutRest } from 'app/shopify.server';

const GET_PRODUCTS = `#graphql
  query GetProducts {
    products(first: 10) {
      nodes {
        id
        title
        handle
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

export async function getProducts(admin: AdminApiContextWithoutRest) {
  const response = await admin.graphql(GET_PRODUCTS);
  const responseJSON = await response.json();
  return responseJSON;
}
