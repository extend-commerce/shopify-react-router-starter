import { db } from 'app/db.server';
import { sessionTable } from 'app/db/schema';
import { getLogger } from 'app/lib/logger';
import { authenticate } from 'app/shopify.server';
import { eq } from 'drizzle-orm';
import { type Route } from './+types/webhooks.app.uninstalled';

const logger = getLogger(['app', 'webhooks']);

export const action = async ({ request }: Route.ActionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  logger.info(`Received webhook`, { topic });

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.delete(sessionTable).where(eq(sessionTable.shop, shop));
  }

  return new Response();
};
