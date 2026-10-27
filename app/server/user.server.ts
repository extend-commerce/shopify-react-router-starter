import { getLogger } from 'app/lib/logger';
import { type AdminApiContext } from 'app/shopify.server';
import jwt from 'jsonwebtoken';
import z from 'zod/v4';

const logger = getLogger(['app']);

const User = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  account_owner: z.boolean(),
  locale: z.string(),
  collaborator: z.boolean(),
  email_verified: z.boolean(),
});
export type User = z.infer<typeof User>;

const TokenExchangeResponse = z.object({ associated_user: User });

/**
 * Reads the raw Shopify ID token (session token) from the request, the same way
 * `authenticate.admin` does: App Bridge sends it as an `Authorization: Bearer` header on fetch
 * requests, and as the `id_token` search param on document requests. `authenticate.admin` only
 * returns the decoded payload (`sessionToken`), but token exchange needs the signed JWT itself.
 *
 * Only call this after `authenticate.admin(request)` has succeeded, so the token is validated.
 */
function getIdToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.split('Bearer ').at(1) ?? null;
  }

  return new URL(request.url).searchParams.get('id_token');
}

/**
 * Gets the logged in staff member by exchanging the request's ID token for an online access token,
 * whose response carries the associated user.
 *
 * @throws {Error} If the request has no ID token, or the token exchange fails.
 *
 * @param {AdminApiContext} ctx The result of `authenticate.admin(request)`
 * @param {Request} request The request `ctx` was authenticated from
 * @returns {Promise<User>} The logged in user
 */
export async function getLoggedInUser(ctx: AdminApiContext, request: Request): Promise<User> {
  const shopDomain = ctx.session.shop;
  const idToken = getIdToken(request);
  if (!idToken) {
    throw new Error(`No ID token on the request for ${shopDomain}`);
  }

  const payload = {
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    subject_token: idToken,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:online-access-token',
  };

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get current user for ${shopDomain}`, {
      cause: await response.text(),
    });
  }

  return TokenExchangeResponse.parse(await response.json()).associated_user;
}

interface GenerateFeaturebaseTokenParams {
  name: string;
  email: string;
  userId: string;
}
/**
 * Generates a Featurebase token for the given user.
 *
 * @throws {Error} If the required fields are missing or the token generation fails.
 *
 * @param {GenerateFeaturebaseTokenParams} params
 * @returns {string} The generated Featurebase token
 */
export function generateFeaturebaseToken(params: GenerateFeaturebaseTokenParams): string {
  if (!process.env.FEATUREBASE_SECRET) {
    throw new Error('FEATUREBASE_SECRET not found');
  }

  if (!params.name || !params.email || !params.userId) {
    const missingFields = Object.entries(params)
      .filter(([_, v]) => !v)
      .map(([k]) => `'${k}'`)
      .join(', ');

    throw new Error(
      `Failed to generate Featurebase token: Required fields are missing ${missingFields}`,
    );
  }

  try {
    return jwt.sign(params, process.env.FEATUREBASE_SECRET, {
      algorithm: 'HS256',
    });
  } catch (error) {
    throw new Error('Failed to generate Featurebase token', { cause: error });
  }
}

export interface PrepareUserInfoResult {
  user: User | null;
  featurebaseToken: string | null;
}
/**
 * Loads the logged in user and signs their Featurebase token. Never throws: on failure both are
 * `null`, so Featurebase still loads for an anonymous visitor.
 *
 * @param {AdminApiContext} ctx The result of `authenticate.admin(request)`
 * @param {Request} req The request `ctx` was authenticated from
 */
export async function prepareUserInfo(
  ctx: AdminApiContext,
  req: Request,
): Promise<PrepareUserInfoResult> {
  try {
    const user = await getLoggedInUser(ctx, req);
    const featurebaseToken = generateFeaturebaseToken({
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      userId: user.id.toString(),
    });

    return { user, featurebaseToken };
  } catch (error) {
    logger.error('Failed to prepare user info', { error });
    return { user: null, featurebaseToken: null };
  }
}
