import { NavMenu } from '@shopify/app-bridge-react';
import { AppProvider } from '@shopify/shopify-app-react-router/react';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from 'app/shopify.server';
import {
  Link,
  Outlet,
  useLoaderData,
  useRouteError,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY ?? '',
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      {/*
        Kept as App Bridge's NavMenu (not the Polaris Web Components s-app-nav/s-link
        pair) since NavMenu doesn't depend on @shopify/polaris, and @shopify/polaris-types
        doesn't yet type an s-link rel="home" override.
      */}
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
      </NavMenu>
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
