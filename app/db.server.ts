/// <reference types="@cloudflare/workers-types" />
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';

interface Env {
  DB: D1Database;
}

export const db = drizzle((env as unknown as Env).DB, { schema });
