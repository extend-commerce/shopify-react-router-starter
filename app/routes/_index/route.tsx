import { redirect, type LoaderFunctionArgs } from 'react-router';

// The admin loads the app root (application_url) with ?shop=&host=&id_token=…; forward it to the
// authenticated /app layout.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get('shop')) {
    throw redirect(`/app?${url.searchParams.toString()}`);
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
