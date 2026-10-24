import { existsSync, readFileSync } from 'node:fs';

import { apiVersion } from 'app/lib/shopify-api-version';
import { describe, expect, it } from 'vitest';

// Static checks on app configuration and documentation. No database involved.

interface Subscription {
  topics: string[];
  uri: string;
}

function subscriptions(file: string): { apiVersion: string; subscriptions: Subscription[] } {
  const toml = readFileSync(file, 'utf8');
  const blocks = toml.split('[[webhooks.subscriptions]]').slice(1);
  return {
    apiVersion: /api_version\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? '',
    subscriptions: blocks.map(block => {
      const list = /(?:compliance_topics|topics)\s*=\s*\[([^\]]*)\]/.exec(block)?.[1] ?? '';
      return {
        topics: [...list.matchAll(/"([^"]+)"/g)].map(m => m[1]),
        uri: /uri\s*=\s*"([^"]+)"/.exec(block)?.[1] ?? '',
      };
    }),
  };
}

// What each route is meant to do, checked against the route's source.
const intended: Record<string, { calls: string[]; notCalls?: string[] }> = {
  'app/uninstalled': { calls: ['uninstallShop(db, shop, eventTime)'], notCalls: ['redactShop'] },
  'app/scopes_update': { calls: ['sessionTable', 'scope'], notCalls: ['shopTable', 'Shop('] },
  'shop/update': { calls: ['refreshShop(db, shop, admin)'], notCalls: ['uninstallShop'] },
  'customers/data_request': {
    calls: [
      'recordGdprRequest(db, webhook)',
      "completeGdprRequest(db, gdprRequest.id, 'processed')",
    ],
    notCalls: ['redactShop', 'uninstallShop'],
  },
  'customers/redact': {
    calls: [
      'recordGdprRequest(db, webhook)',
      "completeGdprRequest(db, gdprRequest.id, 'processed')",
    ],
    notCalls: ['redactShop', 'uninstallShop'],
  },
  'shop/redact': {
    calls: [
      'recordGdprRequest(db, webhook)',
      'redactShop(db, webhook.shop)',
      "outcome === 'redacted' ? 'processed' : 'skipped'",
    ],
    notCalls: ['uninstallShop'],
  },
};

const files = ['shopify.app.toml', 'shopify.app.staging.toml'];

describe.each(files)('%s webhook subscriptions', file => {
  const parsed = subscriptions(file);

  it('declares exactly the six intended topics, one subscription each', () => {
    expect(parsed.subscriptions.map(s => s.topics).sort()).toEqual(
      Object.keys(intended)
        .sort()
        .map(topic => [topic]),
    );
  });

  it('uses the API version the app is built against', () => {
    expect(parsed.apiVersion).toBe(apiVersion);
  });

  it.each(Object.keys(intended))(
    '%s points at its own route, which does what is intended',
    topic => {
      const subscription = parsed.subscriptions.find(s => s.topics[0] === topic);
      // The URI is the topic with a leading /webhooks, and the route file is the flat-route name.
      expect(subscription?.uri).toBe(`/webhooks/${topic}`);
      const route = `app/routes/webhooks.${topic.replace('/', '.')}.tsx`;
      expect(existsSync(route), route).toBe(true);

      const source = readFileSync(route, 'utf8');
      expect(source).toMatch(/export const action/);
      for (const call of intended[topic].calls) expect(source, call).toContain(call);
      for (const call of intended[topic].notCalls ?? []) expect(source, call).not.toContain(call);
    },
  );

  it('puts the three mandatory topics under compliance_topics', () => {
    const toml = readFileSync(file, 'utf8');
    for (const topic of ['customers/data_request', 'customers/redact', 'shop/redact']) {
      expect(toml).toMatch(new RegExp(`compliance_topics\\s*=\\s*\\[\\s*"${topic}"\\s*\\]`));
    }
    for (const topic of ['app/uninstalled', 'app/scopes_update', 'shop/update']) {
      expect(toml).toMatch(new RegExp(`\\btopics\\s*=\\s*\\[\\s*"${topic}"\\s*\\]`));
    }
  });
});

it('production and staging declare identical subscriptions', () => {
  const normalize = (file: string) =>
    subscriptions(file)
      .subscriptions.map(s => `${s.topics.join(',')} ${s.uri}`)
      .sort();
  expect(normalize('shopify.app.staging.toml')).toEqual(normalize('shopify.app.toml'));
});

describe('documentation covers the final behavior and extension points', () => {
  const webhooks = readFileSync('docs/webhooks.md', 'utf8');
  const database = readFileSync('docs/database.md', 'utf8');
  const practices = readFileSync('docs/development-practices.md', 'utf8');
  const context = readFileSync('CONTEXT.md', 'utf8');

  it.each(Object.keys(intended))('docs/webhooks.md documents the %s route', topic => {
    expect(webhooks).toContain(`\`${topic}\``);
    expect(webhooks).toContain(`webhooks.${topic.replace('/', '.')}.tsx`);
  });

  it.each([
    ['fallback and allowlist', /Expired offline token fallback/],
    ['independent HMAC check', /HMAC is verified again/],
    ['canary and retirement', /Retiring the fallback/],
    ['strict uninstall guard', /strictly later/],
    ['stale outcome', /`stale`/],
    ['missing-Shop uninstall', /No Shop row/],
    ['redact outcomes', /`skipped`/],
    ['reinstall guard for redaction', /Reinstall protection/],
    ['retry after failed completion', /completion fails/],
    ['fresh Shop after redaction', /Fresh Shop afterwards/],
    ['customer extension points', /Extension points for forks/],
    ['redactShop extension point', /Extension point:.*redactShop/s],
  ])('docs/webhooks.md explains %s', (_name, pattern) => {
    expect(webhooks).toMatch(pattern);
  });

  it('docs/database.md covers all three tables, the lifecycle and the redactShop extension point', () => {
    for (const needle of [
      '`session`',
      '`shop`',
      '`gdpr_request`',
      'ensureShop',
      'redactShop',
      'Extension point',
      'timestamp_ms',
      'indefinitely',
    ]) {
      expect(database, needle).toContain(needle);
    }
  });

  it('development practices explain the admin context shop row vs webhook shop domain', () => {
    expect(practices).toMatch(/authenticate\.admin/);
    expect(practices).toMatch(/Row, not domain/);
  });

  it('CONTEXT.md defines Shop, Reinstall, Shopify Plan, Shop redaction and GDPR Request', () => {
    for (const term of ['Shop', 'Reinstall', 'Shopify Plan', 'Shop redaction', 'GDPR Request']) {
      expect(context).toContain(`**${term}**`);
    }
  });

  it('the docs index describes all three stored entities', () => {
    const index = readFileSync('docs/README.md', 'utf8');
    const line = index.split('\n').find(l => l.includes('database.md')) ?? '';
    expect(line).toMatch(/gdpr_request|GDPR/i);
  });
});
