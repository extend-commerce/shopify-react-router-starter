// Mocked Shopify HTTP surface. Admin GraphQL and the token-exchange endpoint are answered locally;
// nothing leaves the machine. Requests to anything but `*.myshopify.com` (for example Miniflare's
// own loopback traffic) go to the real `fetch`.
import { fromPartial } from '@total-typescript/shoehorn';
import { type AdminApiContextWithoutRest } from 'app/shopify.server';
import { vi } from 'vitest';

/** The mapped fields of a `GetShopSnapshot` response. */
export interface SnapshotInput {
  id: number;
  name: string;
  email: string;
  contactEmail: string;
  shopOwnerName: string;
  primaryDomain: string;
  countryCode: string | null;
  plan: string;
  shopifyPlus: boolean;
  partnerDevelopment: boolean;
}

export const baseSnapshot: SnapshotInput = {
  id: 1001,
  name: 'Example Shop',
  email: 'owner@example.com',
  contactEmail: 'contact@example.com',
  shopOwnerName: 'Olivia Owner',
  primaryDomain: 'example.com',
  countryCode: 'CA',
  plan: 'Basic',
  shopifyPlus: false,
  partnerDevelopment: false,
};

/** The JSON body Admin GraphQL returns for `GetShopSnapshot`. */
export function snapshotBody(overrides: Partial<SnapshotInput> = {}) {
  const s = { ...baseSnapshot, ...overrides };
  return {
    data: {
      shop: {
        id: `gid://shopify/Shop/${s.id}`,
        name: s.name,
        email: s.email,
        contactEmail: s.contactEmail,
        shopOwnerName: s.shopOwnerName,
        primaryDomain: { host: s.primaryDomain },
        billingAddress: { countryCodeV2: s.countryCode },
        plan: {
          publicDisplayName: s.plan,
          shopifyPlus: s.shopifyPlus,
          partnerDevelopment: s.partnerDevelopment,
        },
      },
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type GraphqlHandler = (shop: string) => Response | Promise<Response>;

/** Scriptable stand-in for Shopify's HTTP APIs, shared by the route-level tests. */
export const shopifyMock = {
  /** Shops whose Admin GraphQL was called, in order. */
  graphqlCalls: [] as string[],
  tokenExchangeCalls: [] as string[],
  /** Answers Admin GraphQL. Defaults to a successful snapshot. */
  graphql: (() => json(snapshotBody())) as GraphqlHandler,
  /** Makes the token endpoint reject, as it does for the refresh token of an uninstalled app. */
  rejectTokenRequests: false,
  /** Makes the next requests return this snapshot. */
  respondWith(overrides: Partial<SnapshotInput> = {}) {
    this.graphql = () => json(snapshotBody(overrides));
  },
  reset() {
    this.graphqlCalls = [];
    this.tokenExchangeCalls = [];
    this.rejectTokenRequests = false;
    this.graphql = () => json(snapshotBody());
  },
};

export function installShopifyFetchStub() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (!url.hostname.endsWith('.myshopify.com')) return realFetch(input, init);

    if (url.pathname === '/admin/oauth/access_token') {
      shopifyMock.tokenExchangeCalls.push(url.hostname);
      if (shopifyMock.rejectTokenRequests) return json({ error: 'invalid_request' }, 400);
      return json({
        access_token: 'offline-access-token',
        scope: 'read_products',
        expires_in: 3600,
        refresh_token: 'offline-refresh-token',
        refresh_token_expires_in: 86_400,
      });
    }
    if (/^\/admin\/api\/[^/]+\/graphql\.json$/.test(url.pathname)) {
      shopifyMock.graphqlCalls.push(url.hostname);
      return shopifyMock.graphql(url.hostname);
    }
    return json({ error: `Unmocked Shopify request: ${url.pathname}` }, 404);
  }) as typeof fetch;
}

/** An Admin client for direct calls into `ensureShop`/`refreshShop`, answering with `respond()`. */
export function fakeAdmin(respond: () => Response | Promise<Response>) {
  const graphql = vi.fn(async () => respond());
  return Object.assign(fromPartial<AdminApiContextWithoutRest>({ graphql }), {
    graphqlMock: graphql,
  });
}

/** An Admin client whose snapshot succeeds with `overrides` applied to the base snapshot. */
export function adminReturning(overrides: Partial<SnapshotInput> = {}) {
  return fakeAdmin(() => json(snapshotBody(overrides)));
}

export { json as jsonResponse };
