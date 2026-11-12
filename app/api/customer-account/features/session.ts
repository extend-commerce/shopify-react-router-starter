import { customerProcedure, router } from '../procedures';

// Example feature: who is calling. Copy this file to start a new feature.
export const session = router({
  get: customerProcedure.query(({ ctx }) => ({
    shop: ctx.shop,
    customerId: ctx.customerId,
  })),
});
