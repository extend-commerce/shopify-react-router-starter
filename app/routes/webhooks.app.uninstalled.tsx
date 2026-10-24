import { db } from 'app/db.server';
import { getLogger } from 'app/lib/logger';
import { uninstallShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';

import { type Route } from './+types/webhooks.app.uninstalled';

const logger = getLogger(['app', 'webhooks']);

export const action = async ({ request }: Route.ActionArgs) => {
  const { shop, topic, triggeredAt } = await authenticate.webhook(request);
  logger.info(`Received webhook`, { topic });

  // The Session is deliberately not consulted: cleanup is keyed by domain, so it also runs when
  // authentication produced no Session (the token is gone after uninstall).
  const triggered = triggeredAt ? new Date(triggeredAt) : undefined;
  const eventTime = triggered && !Number.isNaN(triggered.getTime()) ? triggered : new Date();

  // Errors propagate on purpose: Shopify retries a failed delivery.
  const outcome = await uninstallShop(db, shop, eventTime);
  if (outcome === 'uninstalled') {
    logger.debug(`Uninstalled Shop`, { topic, outcome });
  } else if (outcome === 'stale') {
    logger.info(`Ignored uninstall from an earlier install period`, { topic, outcome });
  } else {
    logger.info(`Deleted Sessions for a Shop with no record`, { topic, outcome });
  }

  return new Response();
};
