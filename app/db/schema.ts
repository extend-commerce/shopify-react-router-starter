import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// expires/refreshTokenExpires as text (ISO strings) and userId as a bigint blob mirror
// @shopify/shopify-app-session-storage-drizzle's own SQLite reference schema exactly -
// its DrizzleSessionStorageSQLite adapter writes/reads those shapes, and its TS types require them.
export const sessionTable = sqliteTable('session', {
  id: text('id').primaryKey(),
  shop: text('shop').notNull(),
  state: text('state').notNull(),
  isOnline: integer('isOnline', { mode: 'boolean' }).default(false).notNull(),
  scope: text('scope'),
  expires: text('expires'),
  accessToken: text('accessToken').notNull(),
  userId: blob('userId', { mode: 'bigint' }),
  firstName: text('firstName'),
  lastName: text('lastName'),
  email: text('email'),
  accountOwner: integer('accountOwner', { mode: 'boolean' }),
  locale: text('locale'),
  collaborator: integer('collaborator', { mode: 'boolean' }),
  emailVerified: integer('emailVerified', { mode: 'boolean' }),
  refreshToken: text('refreshToken'),
  refreshTokenExpires: text('refreshTokenExpires'),
});
