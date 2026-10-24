/**
 * Parses the webhook context's `triggeredAt` (the `X-Shopify-Triggered-At` header, an ISO string).
 *
 * The library types it as optional and passes the header through unchecked, so it can be absent or
 * unparseable. Callers choose what that means: `app/uninstalled` must not guess (a substituted
 * receipt time could uninstall a fresh Reinstall), so it throws; `gdpr_request.triggeredAt` is a
 * required audit column, so `recordGdprRequest` falls back to the receipt time.
 *
 * @param triggeredAt The context's `triggeredAt`.
 * @returns The event time, or `undefined` when the value is absent or not a valid date.
 */
export function parseTriggeredAt(triggeredAt: string | undefined): Date | undefined {
  if (!triggeredAt) return undefined;
  const parsed = new Date(triggeredAt);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
