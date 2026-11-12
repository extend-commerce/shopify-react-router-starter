import { session } from './features/session';
import { router } from './procedures';

// One line per feature file. Called from theme app extensions as `api.<feature>.<procedure>`.
export const storefrontRouter = router({
  session,
});

export type StorefrontRouter = typeof storefrontRouter;
