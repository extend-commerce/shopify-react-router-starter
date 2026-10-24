import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

export const gdprRequestTopics = [
  'customers/data_request',
  'customers/redact',
  'shop/redact',
] as const;
export const gdprRequestStatuses = ['pending', 'processed', 'skipped'] as const;

// Audit record of one mandatory compliance webhook, retained indefinitely (even after Shop
// redaction). There is deliberately no foreign key to `shop`: a request can arrive for a shop with
// no Shop row, and the evidence must outlive the row. `payload` has customer email and phone
// removed.
export const gdprRequestTable = sqliteTable(
  'gdpr_request',
  {
    id: text('id').primaryKey(),
    topic: text('topic', { enum: gdprRequestTopics }).notNull(),
    shopId: integer('shopId').notNull(),
    shopDomain: text('shopDomain').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    status: text('status', { enum: gdprRequestStatuses }).default('pending').notNull(),
    triggeredAt: integer('triggeredAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    processedAt: integer('processedAt', { mode: 'timestamp_ms' }),
  },
  table => [index('gdpr_request_shopId_idx').on(table.shopId)],
);
