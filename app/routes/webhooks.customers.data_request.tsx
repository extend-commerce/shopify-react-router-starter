import { db } from 'app/db.server';
import { getLogger } from 'app/lib/logger';
import { completeGdprRequest, recordGdprRequest } from 'app/server/gdpr-request.server';
import { authenticate } from 'app/shopify.server';

import { type Route } from './+types/webhooks.customers.data_request';

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

  // The starter stores no customer data (Sessions and Shops hold only merchant data), so there is
  // nothing to export and the request is acknowledged as processed. This holds whether or not a
  // Shop row exists.
  //
  // EXTENSION POINT: if your app stores customer data, export it here, using the customer and
  // order IDs in `webhook.payload` (`customer.id`, `orders_requested`, `data_request.id`) and
  // deliver it to the merchant. Anything that throws before completion leaves the request
  // `pending` and Shopify redelivers it.
  await completeGdprRequest(db, gdprRequest.id, 'processed');

  return new Response();
};
