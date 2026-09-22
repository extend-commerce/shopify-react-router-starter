import { db } from 'app/db.server';
import { sessionTable } from 'app/db/schema';
import logger from 'app/lib/logger';
import { authenticate } from 'app/shopify.server';
import { eq } from 'drizzle-orm';
import { type ActionFunctionArgs } from 'react-router';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  logger.info(`Received webhook`, { topic, shop });

  const current = payload.current as string[];
  if (session) {
    await db
      .update(sessionTable)
      .set({ scope: current.toString() })
      .where(eq(sessionTable.id, session.id));
  }
  return new Response();
};
