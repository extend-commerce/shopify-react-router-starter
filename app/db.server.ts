import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';

import * as schema from './db/schema';

export const db = drizzle(env.DB, { schema });

/** The Drizzle handle over the D1 binding. Persistence functions take it as their first argument. */
export type Database = typeof db;
