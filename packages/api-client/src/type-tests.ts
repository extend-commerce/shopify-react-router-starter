// Compile-time checks, run by `pnpm typecheck`. If generating packages/api-types ever degrades the
// router types to `any`, these fail instead of every extension silently losing type safety.
// Nothing here runs or ships: extensions import ./storefront and ./customer-account only.
import { type CustomerAccountOutputs } from './customer-account';
import { type StorefrontInputs, type StorefrontOutputs } from './storefront';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type TypeTests = [
  Expect<Equal<StorefrontOutputs['session']['get'], { shop: string; loggedIn: boolean }>>,
  Expect<Equal<StorefrontOutputs['session']['customer'], { customerId: string }>>,
  Expect<Equal<StorefrontInputs['session']['get'], void>>,
  Expect<Equal<CustomerAccountOutputs['session']['get'], { shop: string; customerId: string }>>,
];
