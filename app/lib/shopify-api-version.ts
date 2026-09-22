import { ApiVersion } from '@shopify/shopify-api';

// Kept in its own side-effect-free module so it can be imported by app/shopify.server.ts
// (which initializes the Shopify app and a DB connection pool on import) and by
// .graphqlrc.ts (which must not trigger either) without either one pulling in the other.
export const apiVersion = ApiVersion.October25;
