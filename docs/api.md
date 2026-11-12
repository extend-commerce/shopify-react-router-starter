# Extension API

Theme app extensions and customer account extensions call the app through typed [tRPC](https://trpc.io) procedures. A procedure is a function on the server that an extension calls like a local function, with its input and output types checked on both sides.

```ts
// In an extension
const { loggedIn } = await api.session.get.query();
```

## Where things live

| Path | What it is | Who touches it |
| --- | --- | --- |
| `app/api/<surface>/features/` | Procedures: one file per feature, or a folder once it grows | Everyone |
| `app/api/<surface>/*.ts` | `context.ts`, `procedures.ts`, `router.ts`: the same in every surface | Rarely |
| `app/http/` | Hono app: `app.ts` mounts everything, `surfaces/` authenticates each surface and hands it to tRPC, `middleware/` holds shared helpers | Rarely; see [Changing the HTTP layer](#changing-the-http-layer) |
| `app/routes/api.$.ts` | Hands every `/api/*` request to `app/http` | Nobody |
| `packages/api-types` | Router types generated from `app/api` for extensions | Nobody (`pnpm api:types` writes it) |
| `packages/api-client` | The clients extensions import | Rarely |

A **surface** is one kind of caller with its own authentication:

| Surface | Called from | How it's authenticated | `ctx` |
| --- | --- | --- | --- |
| `storefront` | Theme app extensions, through the app proxy (`/apps/<subpath>/...`) | App proxy signature | `shop`, `customerId` (or `null` for a guest), `admin`, `storefront` (`undefined` if the app isn't installed) |
| `customer-account` | Customer account UI extensions, directly | Session token | `shop`, `customerId` |

## Add a procedure

1. **Write it in a feature file** under the surface, e.g. `app/api/storefront/features/wishlist.ts`. Copy `features/session.ts` to start. When a feature grows, make it a folder: `features/wishlist/index.ts` exports the router, other files hold its procedures.

   ```ts
   import * as z from 'zod';
   import { addToWishlist, listWishlist } from 'app/server/wishlist.server';

   import { customerProcedure, router } from '../procedures';

   export const wishlist = router({
     list: customerProcedure.query(({ ctx }) => listWishlist(ctx.shop, ctx.customerId)),
     add: customerProcedure
       .input(z.object({ productId: z.string() }))
       .mutation(({ ctx, input }) => addToWishlist(ctx.shop, ctx.customerId, input.productId)),
   });
   ```

2. **Add it to the surface's router**, `app/api/storefront/router.ts`:

   ```ts
   export const storefrontRouter = router({ session, wishlist });
   ```

3. **Call it from the extension.** Types update after `pnpm api:types` (or straight away while `pnpm api:types:watch` runs):

   ```ts
   const items = await api.wishlist.list.query();
   await api.wishlist.add.mutate({ productId });
   ```

Use `.query()` for reads and `.mutation()` for writes.

### Pick the procedure builder

Each surface's `procedures.ts` exports only builders that already check who is calling, so there is no way to write an unauthenticated procedure by accident.

- **Storefront:** `shopperProcedure` allows guests; `customerProcedure` requires a logged-in customer and makes `ctx.customerId` a `string`.
- **Customer account:** `customerProcedure`. Every caller is a logged-in customer.

### Rules

- **Take the shop and customer from `ctx`, never from `input`.** `ctx` is verified by Shopify; anything in `input` is whatever the browser sent.
- **Validate input with Zod** (`.input(z.object({...}))`). Never import Zod in an extension: it's server-side only and would bloat the bundle.
- **Return plain data.** A `Date` arrives as a string, and the types say so.
- **Throw `TRPCError` for expected failures:** `throw new TRPCError({ code: 'NOT_FOUND', message: 'No such wishlist.' })`. Common codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`. Anything else becomes a logged 500.
- **Storefront procedures use `ctx.admin` / `ctx.storefront`**, the clients the app proxy check returned. Both are `undefined` when the shop hasn't installed the app:

  ```ts
  if (!ctx.admin) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'App not installed.' });
  return getProducts(ctx.admin);
  ```

- **Customer account procedures call `unauthenticated` from `app/shopify.server`, for `ctx.shop` only** (Shopify's session token check returns no clients):

  ```ts
  import { unauthenticated } from 'app/shopify.server';

  list: customerProcedure.query(async ({ ctx }) => {
    const { admin } = await unauthenticated.admin(ctx.shop);
    return getOrders(admin, ctx.customerId);
  }),
  ```

  "Unauthenticated" means the client comes from the shop's stored install token instead of this request; the request itself was already verified before the procedure runs. The client acts as the app with all its scopes, so filter every query by `ctx.shop` and `ctx.customerId`, never by ids from `input`. A feature test that loads such a procedure must `vi.mock('app/shopify.server', ...)`, as the route tests do.
- **Don't import Hono or anything in `app/http` or `app/routes`** from `app/api`. Lint blocks it.

### Test it

Call procedures directly with a `ctx`, with no HTTP involved. See `app/api/storefront/features/session.test.ts`:

```ts
import { createCallerFactory } from 'app/api/storefront/procedures';
import { storefrontRouter } from 'app/api/storefront/router';

const caller = createCallerFactory(storefrontRouter)({ shop: 'example.myshopify.com', customerId: '42' });
await expect(caller.wishlist.list()).resolves.toEqual([]);
```

## Use it in an extension

Add the client to the extension's `package.json` as `"@packages/api-client": "workspace:*"`, run `pnpm install` from the repository root, then create it once. The extension must bundle TypeScript imports (the workspace client exports source files). Plain theme JavaScript must be bundled before including it in Liquid.

### Theme app extension

Configure the Shopify app proxy in the app TOML used for your environment. This starter does not configure a proxy by default:

```toml
[app_proxy]
url = "/api/storefront"
prefix = "apps"
subpath = "my-app"
```

Deploy the app configuration and use the installed shop's proxy path in the client. Shopify forwards that path to `/api/storefront`, adding the signed shop and customer parameters. Call the shop's proxy URL from the browser, not the Worker's `/api/storefront` URL directly.

```ts
// Theme app extension
import { createStorefrontApi } from '@packages/api-client/storefront';

export const api = createStorefrontApi({
  proxyUrl: `${window.Shopify.routes.root}apps/<subpath>`,
});
```

### Customer account extension

Enable `network_access = true` in `[extensions.capabilities]` in `shopify.extension.toml`. Enable `api_access = true` as well if the extension queries Shopify APIs directly.

The customer must be signed in and the matching Shopify app must have protected customer data access enabled for the session token to include `sub`. Check the app identified by the token's `aud` claim, especially when development/staging and production use different app registrations. See [Shopify's session token documentation](https://shopify.dev/docs/api/customer-account-ui-extensions/latest/target-apis/platform-apis/session-token-api).

```ts
// Customer account extension
import { createCustomerAccountApi } from '@packages/api-client/customer-account';

export const api = createCustomerAccountApi({
  appUrl: process.env.APP_URL,
  getSessionToken: () => shopify.sessionToken.get(),
});
```

`appUrl` is the app backend URL, not the shop domain. Shopify CLI substitutes `process.env.APP_URL` when bundling; the deployment workflows supply it for each environment. For manual builds, supply `APP_URL` too. Restart/rebuild the extension when the development tunnel changes. Pass a function to retrieve a fresh token for each request; do not cache the token yourself.

### Calls and errors

```ts
import { isTRPCClientError } from '@packages/api-client/customer-account';

try {
  const session = await api.session.get.query();
  console.log(session.shop, session.customerId);
} catch (error) {
  if (isTRPCClientError(error)) {
    console.error(error.data?.code, error.message);
  } else {
    throw error;
  }
}
```

Authentication can reject a request before tRPC runs, so a transport/authentication failure may have no `error.data?.code`. The clients use HTTP batching; queries use `.query()` and mutations use `.mutate(input)`. A UI query library is optional and can wrap these calls.

- **Types for props and state:** `StorefrontOutputs['session']['get']`, `CustomerAccountInputs[...]`, and so on, from the same imports.
- **Errors:** `isTRPCClientError(error)`, then read `error.data?.code`.
- **Extensions never import from `app/`.** Lint blocks it; everything comes through `@packages/api-client`.

### Troubleshooting customer account requests

- **401 with a valid token:** inspect whether the verified payload contains `sub`. A valid signature alone does not establish customer identity; check protected customer data access for the correct app registration. Keep the middleware's customer check.
- **Shopify rejects the token:** ensure the backend credentials and extension app registration match. Admin authentication logs describe a separate request and do not prove that the extension authenticated.
- **Invalid URL:** Shopify can send `dest` as a bare hostname or a full URL. The HTTP middleware normalizes both to `ctx.shop`.
- **Network/CORS failure:** check the current backend/tunnel URL and `network_access`. Customer-account middleware adds CORS headers to success and rejection responses, including preflight responses.

Do not log session tokens or return their claims in error responses. Procedures receive `ctx.shop` and `ctx.customerId`, not the raw JWT. Customer IDs follow the calling surface's Shopify claim format; do not assume storefront IDs and customer-account IDs have identical formatting.

## Generated types

`pnpm api:types` writes `packages/api-types/dist` from `app/api/index.ts`. It runs on `pnpm install` and in `pnpm typecheck`; run `pnpm api:types:watch` next to `pnpm dev` while working on procedures. `packages/api-client/src/type-tests.ts` fails `pnpm typecheck` if the generated types ever lose their shape.

## Changing the HTTP layer

`app/http` is the only place Hono is used (lint enforces this). You need it to:

- **Add a surface** (for example checkout): add `app/api/<surface>/` like the others, then `app/http/surfaces/<surface>.ts` to authenticate it, and mount it in `app/http/app.ts`. Export its router type from `app/api/index.ts` and add a client to `packages/api-client`.
- **Add a non-tRPC endpoint** (REST for partners, uploads): add Hono routes under `app/http/routes/` (create it then) and mount them in `app/http/app.ts`.

Every `/api/*` path belongs to Hono. Don't add other `app/routes/api.*` files: React Router would match them first, without an error (`app/http/app.test.ts` checks this).

Shopify's `authenticate.public.*` helpers reject a request by throwing a `Response`. Wrap them in `catchRejection()` from `app/http/middleware/catch-rejection.ts` and return the Response from the middleware, as the existing surfaces do.
