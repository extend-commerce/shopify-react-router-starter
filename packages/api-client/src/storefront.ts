import { type StorefrontRouter } from '@packages/api-types';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';

export { isTRPCClientError } from '@trpc/client';

/** What each storefront procedure takes, e.g. `StorefrontInputs['session']['get']`. */
export type StorefrontInputs = inferRouterInputs<StorefrontRouter>;
/** What each storefront procedure returns, e.g. `StorefrontOutputs['session']['get']`. */
export type StorefrontOutputs = inferRouterOutputs<StorefrontRouter>;

export interface StorefrontApiOptions {
  /**
   * The app proxy URL on the shop's own domain: `${window.Shopify.routes.root}apps/<subpath>`.
   * `routes.root` keeps the locale prefix (e.g. `/fr/`) that Shopify Markets adds.
   */
  proxyUrl: string;
}

/**
 * A typed client for app/api/storefront, for theme app extensions. Requests go through the app
 * proxy, which signs them and tells the app which customer (if any) is logged in.
 *
 * ```ts
 * const api = createStorefrontApi({ proxyUrl: `${window.Shopify.routes.root}apps/my-app` });
 * const { loggedIn } = await api.session.get.query();
 * ```
 */
export function createStorefrontApi({ proxyUrl }: StorefrontApiOptions) {
  return createTRPCClient<StorefrontRouter>({
    links: [httpBatchLink({ url: proxyUrl.replace(/\/$/, '') })],
  });
}
