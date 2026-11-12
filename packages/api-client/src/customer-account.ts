import { type CustomerAccountRouter } from '@packages/api-types';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';

export { isTRPCClientError } from '@trpc/client';

/** What each customer account procedure takes, e.g. `CustomerAccountInputs['session']['get']`. */
export type CustomerAccountInputs = inferRouterInputs<CustomerAccountRouter>;
/** What each customer account procedure returns, e.g. `CustomerAccountOutputs['session']['get']`. */
export type CustomerAccountOutputs = inferRouterOutputs<CustomerAccountRouter>;

export interface CustomerAccountApiOptions {
  /** The app's own URL, e.g. `process.env.APP_URL`, which Shopify CLI bakes into the bundle. */
  appUrl: string;
  /** Returns a fresh session token: `() => shopify.sessionToken.get()`. */
  getSessionToken: () => Promise<string>;
}

/**
 * A typed client for app/api/customer-account, for customer account UI extensions. Each request
 * carries the customer's session token, which the app checks before any procedure runs.
 *
 * ```ts
 * const api = createCustomerAccountApi({
 *   appUrl: process.env.APP_URL,
 *   getSessionToken: () => shopify.sessionToken.get(),
 * });
 * const { customerId } = await api.session.get.query();
 * ```
 */
export function createCustomerAccountApi({ appUrl, getSessionToken }: CustomerAccountApiOptions) {
  return createTRPCClient<CustomerAccountRouter>({
    links: [
      httpBatchLink({
        url: `${appUrl.replace(/\/$/, '')}/api/customer-account`,
        headers: async () => ({ Authorization: `Bearer ${await getSessionToken()}` }),
      }),
    ],
  });
}
