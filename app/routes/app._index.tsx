import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
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
    <s-page heading="Shopify React Router Starter">
      <s-grid
        gridTemplateColumns="repeat(auto-fill, minmax(260px, 1fr))"
        gap="base"
      >
        {products.map(product => (
          <s-grid-item key={product.id}>
            <ProductCard product={product} />
          </s-grid-item>
        ))}
      </s-grid>
    </s-page>
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
        amount?: string;
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
  }).format(Number(product.priceRangeV2.minVariantPrice.amount ?? 0));

  return (
    <s-section padding="none">
      <s-image
        src={imageUrl}
        alt={imageAltText}
        aspectRatio="3/2"
        objectFit="cover"
        loading="lazy"
      />
      <s-box padding="base">
        <s-stack direction="block" gap="small">
          <s-heading>{product.title}</s-heading>
          <s-stack
            direction="inline"
            gap="small"
            justifyContent="space-between"
          >
            <s-text type="strong">{price}</s-text>
            <s-badge tone="success">Available</s-badge>
          </s-stack>
        </s-stack>
      </s-box>
    </s-section>
  );
}
