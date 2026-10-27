import { AppProvider } from '@shopify/shopify-app-react-router/react';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { ClientOnly } from 'app/components/client-only';
import { Featurebase } from 'app/components/featurebase';
import { prepareUserInfo } from 'app/server/user.server';
import { authenticate } from 'app/shopify.server';
import { useEffect } from 'react';
import { Outlet, useNavigation, useRouteError } from 'react-router';

import { type Route } from './+types/app';

export const loader = async ({ request }: Route.LoaderArgs) => {
  const ctx = await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY ?? '',
    featurebaseAppId: process.env.FEATUREBASE_APP_ID ?? '',
    userInfo: prepareUserInfo(ctx, request),
  };
};

export default function App({ loaderData }: Route.ComponentProps) {
  const { apiKey, featurebaseAppId, userInfo } = loaderData;
  const navigation = useNavigation();

  const isNavigating = Boolean(navigation.location);

  useEffect(() => {
    shopify.loading(isNavigating);
  }, [isNavigating]);

  return (
    <AppProvider apiKey={apiKey}>
      <ClientOnly>
        <Featurebase appId={featurebaseAppId} userInfo={userInfo} />
      </ClientOnly>
      <s-app-nav>
        {/* @ts-expect-error -- remove once polaris-types adds `rel` to s-link */}
        <s-link href="/app" rel="home">
          Home
        </s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: Route.HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
