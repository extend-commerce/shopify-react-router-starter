const REDACTED = '[redacted]';

// Shopify's logger interpolates debug fields into the message string before our bridge sees
// them (`sessionToken: {"header":"<jwt>",...}`, `payload: {...}`, and a parse error that
// quotes the raw token). The values are one JSON object deep, so a single `}` ends each one.
export function redactShopifyLogMessage(message: string): string {
  return message
    .replace(/sessionToken: \{[^}]*\}/g, `sessionToken: ${REDACTED}`)
    .replace(/payload: \{[^}]*\}/g, `payload: ${REDACTED}`)
    .replace(/payload: \[object Object\]/g, `payload: ${REDACTED}`)
    .replace(/session token '[^']*'/g, `session token '${REDACTED}'`);
}
