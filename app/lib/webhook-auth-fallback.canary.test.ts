import { createHmac } from 'node:crypto';

import { Session } from '@shopify/shopify-api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiVersion } from './shopify-api-version';

// CANARY for the fallback in ./webhook-auth-fallback.ts. It runs the real Shopify library, not
// the fallback, and asserts the upstream bug is still there: a stored offline Session with an
// expired token whose refresh is rejected makes `authenticate.webhook` throw a bare 500.
//
// If this test fails after a dependency upgrade, the library no longer throws. Do not weaken the
// assertion: remove the fallback, this canary and the fallback docs in docs/webhooks.md, then
// reassess how the library behaves for each topic.
// Upstream issue: https://github.com/Shopify/shopify-app-js/issues/3360
// Proposed fix:   https://github.com/Shopify/shopify-app-js/pull/3443

const SECRET = 'canary-secret';
const SHOP = 'canary.myshopify.com';

afterEach(() => {
  vi.unstubAllGlobals();
});

function expiredOfflineSession() {
  return new Session({
    id: `offline_${SHOP}`,
    shop: SHOP,
    state: 'state',
    isOnline: false,
    accessToken: 'expired-access-token',
    expires: new Date(Date.now() - 60 * 60 * 1000),
    refreshToken: 'refresh-token',
    refreshTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
  });
}

// The library captures the global `fetch` when its adapter is first imported, so the stub has to
// be in place before the library is loaded.
async function createApp(session: Session, fetchStub: typeof fetch) {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchStub);
  const { AppDistribution, shopifyApp } = await import('@shopify/shopify-app-react-router/server');
  return shopifyApp({
    apiKey: 'canary-key',
    apiSecretKey: SECRET,
    apiVersion,
    appUrl: 'https://app.example.com',
    distribution: AppDistribution.AppStore,
    logger: { log: () => {} },
    sessionStorage: {
      storeSession: async () => true,
      loadSession: async id => (id === session.id ? session : undefined),
      deleteSession: async () => true,
      deleteSessions: async () => true,
      findSessionsByShop: async () => [session],
    },
    future: { expiringOfflineAccessTokens: true },
  });
}

describe('shopify-app-react-router webhook authentication (canary)', () => {
  it('still throws a bare 500 when the stored offline token is expired and the refresh fails', async () => {
    // Shopify rejects the refresh with an error that is not `invalid_subject_token`.
    const refresh = vi.fn(async () => Response.json({ error: 'invalid_request' }, { status: 400 }));
    const body = JSON.stringify({ app_id: 1 });
    const request = new Request('https://app.example.com/webhooks/app/uninstalled', {
      method: 'POST',
      body,
      headers: {
        'X-Shopify-Hmac-Sha256': createHmac('sha256', SECRET).update(body).digest('base64'),
        'X-Shopify-Topic': 'app/uninstalled',
        'X-Shopify-Shop-Domain': SHOP,
        'X-Shopify-API-Version': '2026-07',
        'X-Shopify-Webhook-Id': 'canary-webhook',
      },
    });

    const app = await createApp(expiredOfflineSession(), refresh);

    const thrown = await app.authenticate.webhook(request).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(500);
    // Guards against a 500 for an unrelated reason: the refresh must actually have been attempted.
    expect(refresh).toHaveBeenCalled();
  });
});
