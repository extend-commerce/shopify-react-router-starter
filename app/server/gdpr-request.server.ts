import { type Database } from 'app/db.server';
import { gdprRequestTable } from 'app/db/schema';
import { eq } from 'drizzle-orm';

/** A persisted mandatory compliance-webhook request. */
export type GdprRequest = typeof gdprRequestTable.$inferSelect;

/**
 * The parts of an authenticated webhook context that `recordGdprRequest` reads. The context
 * returned by `authenticate.webhook` satisfies this.
 */
export interface GdprWebhook {
  /** `X-Shopify-Webhook-Id`: unique per delivery attempt group, and the deduplication key. */
  webhookId: string;
  /** Normalized topic as `authenticate.webhook` returns it, e.g. `CUSTOMERS_REDACT`. */
  topic: string;
  /** Raw mandatory-compliance payload, which includes `shop_id` and `shop_domain`. */
  payload: Record<string, unknown>;
  /** `X-Shopify-Triggered-At` as an ISO string. Receipt time is used when it is absent. */
  triggeredAt?: string;
}

const wireTopics = {
  CUSTOMERS_DATA_REQUEST: 'customers/data_request',
  CUSTOMERS_REDACT: 'customers/redact',
  SHOP_REDACT: 'shop/redact',
} as const satisfies Record<string, GdprRequest['topic']>;

function toWireTopic(topic: string): GdprRequest['topic'] {
  const wireTopic = wireTopics[topic as keyof typeof wireTopics] as
    | GdprRequest['topic']
    | undefined;
  if (!wireTopic) {
    throw new Error(`"${topic}" is not a mandatory compliance topic`);
  }
  return wireTopic;
}

// Customer ID, order IDs and data-request IDs stay as the audit trail; contact details do not.
function scrubPayload(payload: Record<string, unknown>) {
  if (typeof payload.customer !== 'object' || payload.customer === null) {
    return payload;
  }
  const { email: _email, phone: _phone, ...customer } = payload.customer as Record<string, unknown>;
  return { ...payload, customer };
}

function parseTriggeredAt(triggeredAt: string | undefined, fallback: Date) {
  const parsed = triggeredAt ? new Date(triggeredAt) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Persists a mandatory compliance webhook as `pending` before any work is done for it, with
 * customer email and phone removed from the stored payload. The insert conflicts on the webhook
 * ID, so Shopify's redeliveries of the same webhook map to the same row. It needs no Shop row.
 *
 * @returns The `pending` row to process: the newly inserted one, or an existing one left pending
 * by an earlier failed delivery. `null` when the request already reached a terminal status
 * (`processed` or `skipped`), meaning there is nothing left to do.
 * @throws If the topic is not one of the three mandatory compliance topics, or on a database error.
 */
export async function recordGdprRequest(
  database: Database,
  webhook: GdprWebhook,
): Promise<GdprRequest | null> {
  const now = new Date();
  const insertedRows = await database
    .insert(gdprRequestTable)
    .values({
      id: webhook.webhookId,
      topic: toWireTopic(webhook.topic),
      shopId: Number(webhook.payload.shop_id),
      shopDomain: String(webhook.payload.shop_domain),
      payload: scrubPayload(webhook.payload),
      triggeredAt: parseTriggeredAt(webhook.triggeredAt, now),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  const inserted = insertedRows.at(0);
  if (inserted) {
    return inserted;
  }

  const existingRows = await database
    .select()
    .from(gdprRequestTable)
    .where(eq(gdprRequestTable.id, webhook.webhookId));
  const existing = existingRows.at(0);
  return existing?.status === 'pending' ? existing : null;
}

/**
 * Marks a recorded request as finished, setting its status and `processedAt` together. Call it
 * only after the request's action has succeeded, so that a failure leaves it `pending` for the
 * next delivery.
 *
 * @param id The webhook ID the request was recorded under.
 * @param status `processed` when the action ran, `skipped` when it was deliberately not applicable.
 * @throws On a database error.
 */
export async function completeGdprRequest(
  database: Database,
  id: string,
  status: Exclude<GdprRequest['status'], 'pending'>,
): Promise<void> {
  await database
    .update(gdprRequestTable)
    .set({ status, processedAt: new Date() })
    .where(eq(gdprRequestTable.id, id));
}
