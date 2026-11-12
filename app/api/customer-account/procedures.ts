import { initTRPC } from '@trpc/server';

import { type CustomerAccountContext } from './context';

const t = initTRPC.context<CustomerAccountContext>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** A logged-in customer. The HTTP layer already checked the session token. */
export const customerProcedure = t.procedure;
