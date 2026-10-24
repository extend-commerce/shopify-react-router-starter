import { db } from 'app/db.server';
import { getLogger } from 'app/lib/logger';
import { completeGdprRequest, recordGdprRequest } from 'app/server/gdpr-request.server';
import { redactShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';

import { type Route } from './+types/webhooks.shop.redact';

const logger = getLogger(['app', 'webhooks']);

export const action = async ({ request }: Route.ActionArgs) => {
  const webhook = await authenticate.webhook(request);
  logger.info(`Received webhook`, { topic: webhook.topic });

  // Record before acting so an interrupted request stays visible as `pending` and is retried by
  // Shopify's redelivery. `null` means this webhook already finished, so there is nothing to redo.
  const gdprRequest = await recordGdprRequest(db, webhook);
  if (!gdprRequest) {
    logger.info(`Ignored duplicate webhook`, { topic: webhook.topic });
    return new Response();
  }

  // Redaction erases the Shop and its Sessions (see `redactShop` for the guards and the place to
  // add Shop-scoped deletions). It runs for the webhook's domain whether or not a Shop row exists.
  // The GDPR Request rows are kept as evidence. Completing is a separate write: if it fails after
  // the deletes, the request stays `pending` and the redelivery repeats the deletes harmlessly.
  const outcome = await redactShop(db, webhook.shop);
  logger.info(`Redacted shop`, { topic: webhook.topic, shop: webhook.shop, outcome });

  await completeGdprRequest(db, gdprRequest.id, outcome === 'redacted' ? 'processed' : 'skipped');

  return new Response();
};
