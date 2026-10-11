import { redirect } from 'react-router';

import { type Route } from './+types/_index';

// The admin loads the app root (application_url) with ?shop=&host=&id_token=…; forward it to the
// authenticated /app layout.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get('shop')) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Inside the admin, App Bridge can also move the app to / with a client-side navigation (e.g.
  // when the merchant clicks the app name), which requests this loader's data without ?shop but
  // with App Bridge's session token. Send it on to /app, which verifies the token; a forged header
  // only gets as far as that check.
  if (request.headers.get('Authorization')?.startsWith('Bearer ')) {
    throw redirect('/app');
  }

  return null;
};

// Rendered outside the admin iframe, so AppProvider isn't here to load Polaris.
const POLARIS_SCRIPT_URL = 'https://cdn.shopify.com/shopifycloud/polaris.js';

export default function Index() {
  return (
    <>
      <script src={POLARIS_SCRIPT_URL} />
      <s-page inlineSize="small">
        <s-section heading="Shopify React Router Starter">
          <s-paragraph>Open this app from your Shopify admin.</s-paragraph>
        </s-section>
      </s-page>
    </>
  );
}
