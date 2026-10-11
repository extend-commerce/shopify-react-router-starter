import { getProducts } from 'app/server/products.server';
import { authenticate } from 'app/shopify.server';
import { type Route } from './+types/app._index';

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { admin } = await authenticate.admin(request);
  const products = await getProducts(admin);

  return { products };
};

export default function Index({ loaderData }: Route.ComponentProps) {
  const { products } = loaderData;

  return (
    <s-page heading="Shopify React Router Starter">
      <s-grid gridTemplateColumns="repeat(auto-fill, minmax(260px, 1fr))" gap="base">
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
  product: Route.ComponentProps['loaderData']['products'][number];
}
const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/600x400';

function ProductCard({ product }: ProductCardProps) {
  const image = product.featuredMedia?.preview?.image;
  const imageAltText = image?.altText ?? product.title;
  const imageUrl = image?.url ?? PLACEHOLDER_IMAGE_URL;

  const price = Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: product.priceRangeV2.minVariantPrice.currencyCode,
  }).format(Number(product.priceRangeV2.minVariantPrice.amount));

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
          <s-stack direction="inline" gap="small" justifyContent="space-between">
            <s-text type="strong">{price}</s-text>
            <s-badge tone="success">Available</s-badge>
          </s-stack>
        </s-stack>
      </s-box>
    </s-section>
  );
}
