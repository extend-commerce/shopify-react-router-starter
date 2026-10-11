import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from 'app/shopify.server';
import { type Route } from './+types/auth.$';

export const loader = async ({ request }: Route.LoaderArgs) => {
  await authenticate.admin(request);

  return null;
};

export const headers: Route.HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
