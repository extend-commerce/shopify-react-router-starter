import { session } from './features/session';
import { router } from './procedures';

// One line per feature file. Called from customer account extensions as `api.<feature>.<procedure>`.
export const customerAccountRouter = router({ session });

export type CustomerAccountRouter = typeof customerAccountRouter;
