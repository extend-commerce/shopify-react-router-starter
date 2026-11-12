import { customerProcedure, router, shopperProcedure } from '../procedures';

// Example feature: who is calling. Copy this file to start a new feature.
export const session = router({
  get: shopperProcedure.query(({ ctx }) => ({
    shop: ctx.shop,
    loggedIn: ctx.customerId !== null,
  })),

  customer: customerProcedure.query(({ ctx }) => ({
    customerId: ctx.customerId,
  })),
});
