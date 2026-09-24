import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from 'app/shopify.server';
import { HeadersFunction, type LoaderFunctionArgs } from 'react-router';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const headers: HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
