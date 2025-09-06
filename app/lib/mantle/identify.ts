import { MantleClient } from '@heymantle/client';
import { type Session } from '@shopify/shopify-app-remix/server';
import { db } from 'app/db.server';
import { sessionTable } from 'app/db/schema';
import { type AdminApiContextWithoutRest } from 'app/shopify.server';
import { eq } from 'drizzle-orm';

const GET_SHOP_QUERY = `#graphql
  query GetShop {
    shop {
      id
    }
  }
`;

export async function identify(
  admin: AdminApiContextWithoutRest,
  session: Session,
) {
  const response = await admin.graphql(GET_SHOP_QUERY);
  const responseJson = await response.json().catch(_ => null);
  if (!responseJson) {
    throw new Error('Failed to fetch shop');
  }

  const shop = responseJson.data?.shop;
  if (!shop) {
    throw new Error('Shop not found');
  }

  const mantleApiToken = await getMantleApiToken(
    shop.id,
    session.shop,
    session.accessToken,
  );

  await db
    .update(sessionTable)
    .set({ mantleApiToken })
    .where(eq(sessionTable.id, session.id));
}

async function getMantleApiToken(
  platformId: string,
  myshopifyDomain: string,
  accessToken?: string | undefined,
) {
  if (!process.env.MANTLE_APP_ID) {
    throw new Error('MANTLE_APP_ID must be set');
  }

  if (!process.env.MANTLE_APP_API_KEY) {
    throw new Error('MANTLE_APP_API_KEY must be set');
  }

  const mantleClient = new MantleClient({
    appId: process.env.MANTLE_APP_ID,
    apiKey: process.env.MANTLE_APP_API_KEY,
  });

  const identifyResponse = await mantleClient.identify({
    platform: 'shopify',
    platformId,
    myshopifyDomain,
    accessToken,
  });

  if ('error' in identifyResponse) {
    throw new Error(identifyResponse.error);
  }

  return identifyResponse.apiToken;
}
