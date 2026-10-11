import { describe, expect, it } from 'vitest';

import { redactShopifyLogMessage } from './redact-shopify-message';

describe('redactShopifyLogMessage', () => {
  it('redacts a decoded session token', () => {
    const message =
      'Validating session token, sessionToken: {"header":"eyJhbGciOi","payload":"x"}, shop: a';

    expect(redactShopifyLogMessage(message)).toBe(
      'Validating session token, sessionToken: [redacted], shop: a',
    );
  });

  it('redacts a JSON payload', () => {
    expect(redactShopifyLogMessage('Received payload: {"dest":"shop.myshopify.com"}')).toBe(
      'Received payload: [redacted]',
    );
  });

  it('redacts a payload that was stringified as [object Object]', () => {
    expect(redactShopifyLogMessage('Received payload: [object Object]')).toBe(
      'Received payload: [redacted]',
    );
  });

  it('redacts a raw token quoted in a parse error', () => {
    expect(redactShopifyLogMessage("Failed to parse session token 'eyJhbGciOi.abc.def'")).toBe(
      "Failed to parse session token '[redacted]'",
    );
  });

  it('redacts every occurrence', () => {
    expect(redactShopifyLogMessage('payload: {"a":1} then payload: {"b":2}')).toBe(
      'payload: [redacted] then payload: [redacted]',
    );
  });

  it('leaves other messages untouched', () => {
    const message = 'Authenticating admin request, shop: a.myshopify.com';

    expect(redactShopifyLogMessage(message)).toBe(message);
  });
});
