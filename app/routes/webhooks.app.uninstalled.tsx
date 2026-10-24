import { db } from 'app/db.server';
import { getLogger } from 'app/lib/logger';
import { parseTriggeredAt } from 'app/lib/triggered-at';
import { uninstallShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';

import { type Route } from './+types/webhooks.app.uninstalled';

const logger = getLogger(['app', 'webhooks']);

export const action = async ({ request }: Route.ActionArgs) => {
  const { shop, topic, triggeredAt } = await authenticate.webhook(request);
  logger.info(`Received webhook`, { topic });

  // The Session is deliberately not consulted: cleanup is keyed by domain, so it also runs when
  // authentication produced no Session (the token is gone after uninstall).
  //
  // Errors propagate on purpose: Shopify retries a failed delivery. That includes a missing or
  // unparseable event time: substituting the receipt time could uninstall a fresh Reinstall that
  // a delayed delivery from an earlier install period should leave alone.
  const eventTime = parseTriggeredAt(triggeredAt);
  if (!eventTime) {
    throw new Error(`Unusable X-Shopify-Triggered-At on ${topic}: ${JSON.stringify(triggeredAt)}`);
  }

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
