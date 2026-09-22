import { db } from 'app/db.server';
import { sessionTable } from 'app/db/schema';
import logger from 'app/lib/logger';
import { authenticate } from 'app/shopify.server';
import { eq } from 'drizzle-orm';
import { type ActionFunctionArgs } from 'react-router';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  logger.info(`Received webhook`, { topic, shop });

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.delete(sessionTable).where(eq(sessionTable.shop, shop));
  }

  return new Response();
};
