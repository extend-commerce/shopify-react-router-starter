import { beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations, d1 } from './support/harness';

interface Column {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

async function columns(table: string) {
  const { results } = await d1.prepare(`PRAGMA table_info('${table}')`).all<Column>();
  return Object.fromEntries(results.map(c => [c.name, c]));
}

describe('migrations and schema (real local D1)', () => {
  beforeAll(applyMigrations);

  it('creates the shop table with the specified columns, types and nullability', async () => {
    const cols = await columns('shop');
    const shape = Object.fromEntries(
      Object.entries(cols).map(([name, c]) => [
        name,
        `${c.type.toLowerCase()}${c.notnull ? ' NOT NULL' : ''}`,
      ]),
    );

    expect(shape).toEqual({
      id: 'integer NOT NULL',
      myshopifyDomain: 'text NOT NULL',
      name: 'text NOT NULL',
      email: 'text NOT NULL',
      contactEmail: 'text NOT NULL',
      shopOwnerName: 'text NOT NULL',
      primaryDomain: 'text NOT NULL',
      countryCode: 'text',
      shopifyPlan: 'text NOT NULL',
      shopifyPlus: 'integer NOT NULL',
      partnerDevelopment: 'integer NOT NULL',
      installedAt: 'integer NOT NULL',
      uninstalledAt: 'integer',
      createdAt: 'integer NOT NULL',
      updatedAt: 'integer NOT NULL',
    });
    expect(cols.id.pk).toBe(1);
  });

  it('uses the supplied Shop ID: the primary key is not generated', async () => {
    const sql = await d1
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'shop'")
      .first<{ sql: string }>();
    expect(sql?.sql).not.toMatch(/AUTOINCREMENT/i);
  });

  it('makes myshopifyDomain unique and rejects a second Shop with the same domain', async () => {
    const { results } = await d1
      .prepare("PRAGMA index_list('shop')")
      .all<{ name: string; unique: number }>();
    const uniqueIndexes = results.filter(i => i.unique);
    const indexed: string[] = [];
    for (const index of uniqueIndexes) {
      const { results: info } = await d1
        .prepare(`PRAGMA index_info('${index.name}')`)
        .all<{ name: string }>();
      indexed.push(...info.map(i => i.name));
    }
    expect(indexed).toContain('myshopifyDomain');

    const insert = (id: number) =>
      d1
        .prepare(
          `INSERT INTO shop (id, myshopifyDomain, name, email, contactEmail, shopOwnerName,
            primaryDomain, shopifyPlan, shopifyPlus, partnerDevelopment, installedAt, createdAt,
            updatedAt) VALUES (?, 'dup.myshopify.com', 'n', 'e', 'c', 'o', 'p', 'Basic', 0, 0, 1, 1, 1)`,
        )
        .bind(id)
        .run();
    await insert(1);
    await expect(insert(2)).rejects.toThrow(/UNIQUE/i);
    await d1.prepare('DELETE FROM shop').run();
  });

  it('creates gdpr_request with the specified columns and a pending default status', async () => {
    const cols = await columns('gdpr_request');
    const shape = Object.fromEntries(
      Object.entries(cols).map(([name, c]) => [
        name,
        `${c.type.toLowerCase()}${c.notnull ? ' NOT NULL' : ''}`,
      ]),
    );

    expect(shape).toEqual({
      id: 'text NOT NULL',
      topic: 'text NOT NULL',
      shopId: 'integer NOT NULL',
      shopDomain: 'text NOT NULL',
      payload: 'text NOT NULL',
      status: 'text NOT NULL',
      triggeredAt: 'integer NOT NULL',
      createdAt: 'integer NOT NULL',
      processedAt: 'integer',
    });
    expect(cols.id.pk).toBe(1);
    expect(cols.status.dflt_value).toBe("'pending'");
    // No updatedAt / note column, per the schema decision.
    expect(cols).not.toHaveProperty('updatedAt');
  });

  it('indexes gdpr_request.shopId', async () => {
    const { results } = await d1
      .prepare("PRAGMA index_list('gdpr_request')")
      .all<{ name: string }>();
    expect(results.map(i => i.name)).toContain('gdpr_request_shopId_idx');
    const { results: info } = await d1
      .prepare("PRAGMA index_info('gdpr_request_shopId_idx')")
      .all<{ name: string }>();
    expect(info.map(i => i.name)).toEqual(['shopId']);
  });

  it('declares no foreign keys on shop, gdpr_request or session', async () => {
    for (const table of ['shop', 'gdpr_request', 'session']) {
      const { results } = await d1.prepare(`PRAGMA foreign_key_list('${table}')`).all();
      expect(results, table).toEqual([]);
    }
  });

  it('keeps the Session table schema the session adapter needs', async () => {
    const cols = await columns('session');
    expect(Object.keys(cols).sort()).toEqual(
      [
        'id',
        'shop',
        'state',
        'isOnline',
        'scope',
        'expires',
        'accessToken',
        'userId',
        'firstName',
        'lastName',
        'email',
        'accountOwner',
        'locale',
        'collaborator',
        'emailVerified',
        'refreshToken',
        'refreshTokenExpires',
      ].sort(),
    );
  });

  it('defaults a new GDPR Request to pending with no processedAt', async () => {
    await expect(
      d1
        .prepare(
          `INSERT INTO gdpr_request (id, topic, shopId, shopDomain, payload, triggeredAt, createdAt)
           VALUES ('x', 'customers/redact', 1, 'a.myshopify.com', '{}', 1, 1)`,
        )
        .run(),
    ).resolves.toBeDefined();
    const row = await d1
      .prepare("SELECT status, processedAt FROM gdpr_request WHERE id = 'x'")
      .first<{ status: string; processedAt: number | null }>();
    expect(row).toEqual({ status: 'pending', processedAt: null });
    await d1.prepare('DELETE FROM gdpr_request').run();
  });
});
