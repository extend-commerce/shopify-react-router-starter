import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import Index from './app._index';

// The route module imports the Shopify app, which opens a D1 binding on import.
vi.mock('app/shopify.server', () => ({}));

const products = [
  {
    id: 'gid://shopify/Product/1',
    title: 'The Complete Snowboard',
    handle: 'the-complete-snowboard',
    featuredMedia: {
      preview: {
        image: { url: 'https://cdn.shopify.com/snowboard.png', altText: 'A snowboard' },
      },
    },
    priceRangeV2: { minVariantPrice: { amount: '699.95', currencyCode: 'USD' } },
  },
  {
    id: 'gid://shopify/Product/2',
    title: 'Gift Card',
    handle: 'gift-card',
    featuredMedia: null,
    priceRangeV2: { minVariantPrice: { amount: '10.0', currencyCode: 'USD' } },
  },
];

function renderIndex(loaderData: { products: typeof products }) {
  const Stub = createRoutesStub([
    { path: '/app', Component: Index, HydrateFallback: () => null, loader: () => loaderData },
  ]);
  return render(<Stub initialEntries={['/app']} />);
}

describe('app index', () => {
  it('renders a card per product', async () => {
    const { container } = renderIndex({ products });

    await screen.findByText('The Complete Snowboard');
    expect(container).toMatchSnapshot();
  });

  it('falls back to the product title and a placeholder image', async () => {
    const { container } = renderIndex({ products });

    await screen.findByText('Gift Card');
    const image = container.querySelector('s-image[alt="Gift Card"]');
    expect(image?.getAttribute('src')).toBe('https://placehold.co/600x400');
  });

  it('renders an empty grid without products', async () => {
    const { container } = renderIndex({ products: [] });

    await vi.waitFor(() => expect(container.querySelector('s-page')).not.toBeNull());
    expect(container.querySelectorAll('s-grid-item')).toHaveLength(0);
  });
});
