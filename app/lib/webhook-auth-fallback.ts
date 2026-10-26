import { getLogger } from './logger';

const logger = getLogger(['app', 'webhooks']);

// Topics that must still reach their handler when the stored offline token can't be refreshed:
// they arrive after uninstall, when the token is expired by definition, and they only delete data.
// Every other topic keeps the library's 500 so Shopify retries it.
const FALLBACK_TOPICS: ReadonlySet<string> = new Set([
  'APP_UNINSTALLED',
  'SHOP_REDACT',
  'CUSTOMERS_REDACT',
  'CUSTOMERS_DATA_REQUEST',
]);

// Same normalization the library applies to the `X-Shopify-Topic` header ('app/uninstalled' ->
// 'APP_UNINSTALLED'), so the fallback context matches what the library would have returned.
function normalizeTopic(topic: string) {
  return topic.toUpperCase().replace(/\/|\./g, '_');
}

function status(code: number) {
  return new Response(undefined, { status: code });
}

function parsePayload(rawBody: string): Record<string, unknown> | undefined {
  try {
    const payload: unknown = JSON.parse(rawBody);
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

// `subtle.verify` compares the signature in constant time, unlike comparing two strings.
async function hasValidSignature(rawBody: string, hmacHeader: string | null, secret: string) {
  if (!hmacHeader || !secret) return false;
  try {
    const signature = Uint8Array.from(atob(hmacHeader), char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(rawBody));
  } catch {
    // Malformed base64 in the header: not a valid signature.
    return false;
  }
}

/**
 * Runs the library's webhook authentication, falling back to a sessionless context when the
 * library fails with a 500 for an uninstall or mandatory compliance topic.
 *
 * Why: the library refreshes an expired offline token before returning, and a rejected refresh
 * surfaces as a bare 500 Response. After uninstall the token is always rejected, so `app/uninstalled`
 * and the compliance webhooks would be retried and then dropped by Shopify without ever running.
 *
 * The 500 is never trusted as proof of authenticity. The fallback re-verifies the HMAC-SHA256 of
 * the raw body with the app secret and throws 401 on mismatch. Successful results and every other
 * failure (including a 500 on any other topic) pass through unchanged.
 *
 * Only classic webhook headers are read: every allowlisted topic is delivered that way.
 *
 * @param authenticate The library's `authenticate.webhook`.
 * @param request The incoming webhook request. It is cloned first because the library consumes the body.
 * @param secret The app secret that signs webhook deliveries.
 * @throws {Response} The library's failure, or 401 for a bad signature, or 400 for missing headers or a non-JSON body.
 *
 * TODO: remove this fallback (and its canary test) once the library handles a failed refresh
 * itself. Upstream issue: https://github.com/Shopify/shopify-app-js/issues/3360, proposed fix:
 * https://github.com/Shopify/shopify-app-js/pull/3443.
 */
export async function authenticateWebhookWithFallback<T>(
  authenticate: (request: Request) => Promise<T>,
  request: Request,
  secret: string,
) {
  const fallbackRequest = request.clone();
  try {
    return await authenticate(request);
  } catch (error) {
    if (!(error instanceof Response) || error.status !== 500) throw error;

    const headers = fallbackRequest.headers;
    const topic = normalizeTopic(headers.get('X-Shopify-Topic') ?? '');
    if (!FALLBACK_TOPICS.has(topic)) throw error;

    const rawBody = await fallbackRequest.text();
    if (!(await hasValidSignature(rawBody, headers.get('X-Shopify-Hmac-Sha256'), secret))) {
      throw status(401);
    }

    const shop = headers.get('X-Shopify-Shop-Domain');
    const webhookId = headers.get('X-Shopify-Webhook-Id');
    const apiVersion = headers.get('X-Shopify-API-Version');
    if (!shop || !webhookId || !apiVersion) throw status(400);

    const payload = parsePayload(rawBody);
    if (!payload) throw status(400);

    logger.warn('Authenticated webhook without a session: offline token refresh failed', {
      shop,
      topic,
      webhookId,
    });

    // Same shape as the library's context when the shop has no stored Session.
    return {
      apiVersion,
      shop,
      topic,
      webhookId,
      payload,
      session: undefined,
      admin: undefined,
      webhookType: 'webhooks' as const,
      triggeredAt: headers.get('X-Shopify-Triggered-At') ?? undefined,
    };
  }
}
