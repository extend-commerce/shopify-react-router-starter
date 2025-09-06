import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  Image,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { getProducts } from 'app/server/products.server';
import { authenticate } from 'app/shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const products = await getProducts(admin);

  return { products: products.data?.products.nodes ?? [] };
};

export default function Index() {
  const { products } = useLoaderData<typeof loader>();

  return (
    <Page title="Shopify Remix Starter">
      <Layout>
        {products.map(product => (
          <ProductCard product={product} key={product.id} />
        ))}
      </Layout>
    </Page>
  );
}

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    featuredMedia?: {
      preview?: {
        image?: {
          url?: string;
          altText?: string | null;
        } | null;
      } | null;
    } | null;
    priceRangeV2: {
      minVariantPrice: {
        amount?: number;
        currencyCode: string;
      };
    };
  };
}
const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/600x400';

function ProductCard({ product }: ProductCardProps) {
  const image = product.featuredMedia?.preview?.image;
  const imageAltText = image?.altText ?? product.title;
  const imageUrl = image?.url ?? PLACEHOLDER_IMAGE_URL;

  const price = Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: product.priceRangeV2.minVariantPrice.currencyCode,
  }).format(product.priceRangeV2.minVariantPrice.amount ?? 0);

  return (
    <Layout.Section key={product.id} variant="oneThird">
      <Card padding="0">
        <BlockStack gap="300">
          <Image
            source={imageUrl}
            alt={imageAltText}
            width="100%"
            height={200}
            style={{ objectFit: 'cover' }}
          />
          <Box paddingInline="300" paddingBlockEnd="300">
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">
                {product.title}
              </Text>
              <InlineStack gap="200" align="space-between">
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  {price}
                </Text>
                <Badge tone="success">Available</Badge>
              </InlineStack>
            </BlockStack>
          </Box>
        </BlockStack>
      </Card>
    </Layout.Section>
  );
}
