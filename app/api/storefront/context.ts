import {
  type AdminApiContext,
  type StorefrontApiContext,
} from '@shopify/shopify-app-react-router/server';

/**
 * What every storefront procedure gets as `ctx`. Built by the HTTP layer (app/http/surfaces/storefront.ts)
 * after the app proxy signature is checked.
 */
export type StorefrontContext = {
  /** The shop's `*.myshopify.com` domain. */
  shop: string;
  /** The logged-in customer's numeric id, or `null` for a guest. */
  customerId: string | null;
  /**
   * Admin API client from the verified app proxy request, acting as the app with all its scopes.
   * `undefined` when the shop hasn't installed the app.
   */
  admin?: AdminApiContext;
  /** Storefront API client from the same request. `undefined` when the app isn't installed. */
  storefront?: StorefrontApiContext;
};
