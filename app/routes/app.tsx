import { NavMenu } from '@shopify/app-bridge-react';
import {
  AppProvider as PolarisAppProvider,
  type AppProviderProps,
} from '@shopify/polaris';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import polarisTranslations from '@shopify/polaris/locales/en.json';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from 'app/shopify.server';
import { type ComponentProps } from 'react';
import {
  Link,
  Outlet,
  useLoaderData,
  useRouteError,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';

const APP_BRIDGE_URL = 'https://cdn.shopify.com/shopifycloud/app-bridge.js';

type PolarisLinkProps = ComponentProps<
  NonNullable<AppProviderProps['linkComponent']>
>;

// Adapts React Router's `Link` to the shape Polaris expects for its internal link rendering.
function PolarisLink({ url, ...rest }: PolarisLinkProps) {
  return <Link to={url} {...rest} />;
}

export const links = () => [{ rel: 'stylesheet', href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY ?? '',
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <>
      <script src={APP_BRIDGE_URL} data-api-key={apiKey} />
      <PolarisAppProvider
        i18n={polarisTranslations}
        linkComponent={PolarisLink}
      >
        <NavMenu>
          <Link to="/app" rel="home">
            Home
          </Link>
        </NavMenu>
        <Outlet />
      </PolarisAppProvider>
    </>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
