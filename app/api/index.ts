// Entry point for `pnpm api:types`, which writes these router types to packages/api-types for
// extensions to use. Export types only: extensions must never bundle server code.
export type { CustomerAccountRouter } from './customer-account/router';
export type { StorefrontRouter } from './storefront/router';
