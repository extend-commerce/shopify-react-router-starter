import { type HeadersFunction, type LoaderFunctionArgs } from '@remix-run/node';
import { Link, Outlet, useLoaderData, useRouteError } from '@remix-run/react';
import { NavMenu } from '@shopify/app-bridge-react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { boundary } from '@shopify/shopify-app-remix/server';
import { db } from 'app/db.server';
import { sessionTable } from 'app/db/schema';
import { authenticate } from 'app/shopify.server';
import { eq } from 'drizzle-orm';

export const links = () => [{ rel: 'stylesheet', href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [{ mantleApiToken }] = await db
    .select({ mantleApiToken: sessionTable.mantleApiToken })
    .from(sessionTable)
    .limit(1)
    .where(eq(sessionTable.id, session.id));

  return {
    apiKey: process.env.SHOPIFY_API_KEY ?? '',
    mantleAppId: process.env.MANTLE_APP_ID ?? '',
    mantleApiToken: mantleApiToken ?? '',
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* <MantleProvider customerApiToken={mantleApiToken} appId={mantleAppId}> */}
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
      </NavMenu>
      <Outlet />
      {/* </MantleProvider> */}
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
