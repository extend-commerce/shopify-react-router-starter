import { db } from 'app/db.server';
import { getLogger } from 'app/lib/logger';
import { refreshShop } from 'app/server/shop.server';
import { authenticate } from 'app/shopify.server';

import { type Route } from './+types/webhooks.shop.update';

const logger = getLogger(['app', 'webhooks']);

export const action = async ({ request }: Route.ActionArgs) => {
  const { admin, shop, topic } = await authenticate.webhook(request);
  logger.info(`Received webhook`, { topic });

  // `admin` is undefined when the shop has no stored Session (for example after uninstall), and
  // then there is no way to fetch a snapshot. Acknowledge without work; a Shop that is installed
  // again is refreshed by the admin authentication wrapper.
  if (!admin) {
    logger.info(`Ignored webhook without an Admin context`, { topic });
    return new Response();
  }

  // Errors propagate on purpose: Shopify retries a failed delivery.
  const outcome = await refreshShop(db, shop, admin);
  if (outcome === 'refreshed') {
    logger.debug(`Refreshed Shop`, { topic, outcome });
  } else {
    // A delayed update for an uninstalled (or never recorded) Shop must not revive it.
    logger.info(`Ignored update for a Shop that is not installed`, { topic, outcome });
  }

  return new Response();
};
