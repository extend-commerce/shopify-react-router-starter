/**
 * What every customer account procedure gets as `ctx`. Built by the HTTP layer
 * (app/http/surfaces/customer-account.ts) from the extension's session token.
 */
export type CustomerAccountContext = {
  /** The shop's `*.myshopify.com` domain. */
  shop: string;
  /** The logged-in customer's GID, e.g. `gid://shopify/Customer/123`. */
  customerId: string;
};
