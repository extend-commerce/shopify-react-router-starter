import { initTRPC, TRPCError } from '@trpc/server';

import { type StorefrontContext } from './context';

const t = initTRPC.context<StorefrontContext>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Any storefront visitor, guest or logged in. The app proxy signature is already checked. */
export const shopperProcedure = t.procedure;

/** A logged-in customer only. `ctx.customerId` is always a string here. */
export const customerProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.customerId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Log in to continue.' });
  }
  return next({ ctx: { customerId: ctx.customerId } });
});
