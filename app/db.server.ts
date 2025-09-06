import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './db/schema';

export const client = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const db = drizzle({ client, schema });
