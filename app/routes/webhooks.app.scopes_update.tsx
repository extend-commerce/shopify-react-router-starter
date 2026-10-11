import { db } from 'app/db.server';
import { sessionTable } from 'app/db/schema';
import { getLogger } from 'app/lib/logger';
import { authenticate } from 'app/shopify.server';
import { eq } from 'drizzle-orm';

import { type Route } from './+types/webhooks.app.scopes_update';

const logger = getLogger(['app', 'webhooks']);

export const action = async ({ request }: Route.ActionArgs) => {
  const { payload, session, topic } = await authenticate.webhook(request);
  logger.info(`Received webhook`, { topic });

  const current = payload.current as string[];
  if (session) {
    await db
      .update(sessionTable)
      .set({ scope: current.toString() })
      .where(eq(sessionTable.id, session.id));
  }
  return new Response();
};
