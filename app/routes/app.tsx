import { AppProvider } from '@shopify/shopify-app-react-router/react';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from 'app/shopify.server';
import {
  Outlet,
  useLoaderData,
  useRouteError,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY ?? '' };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <ui-nav-menu>
        <a href="/app" rel="home">
          Home
        </a>
        <a href="/app/additional-products">Additional Products</a>
      </ui-nav-menu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
