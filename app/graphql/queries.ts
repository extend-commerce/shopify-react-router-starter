export const PRODUCT_BASIC_FIELDS_FRAGMENT = `#graphql
fragment ProductBasicFields on Product {
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
`;

export const GET_PRODUCTS = `#graphql
${PRODUCT_BASIC_FIELDS_FRAGMENT}

query GetProducts($first: Int!) {
  products(first: $first) {
    nodes {
      ...ProductBasicFields
    }
  }
}
`;
