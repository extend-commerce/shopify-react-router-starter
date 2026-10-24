# Embedded app

Language for a merchant's install of this Shopify app.

## Language

**Shop**:
The merchant tenant, identified by its `*.myshopify.com` domain. Its record survives uninstall and is erased only on Shop redaction.
_Avoid_: store, shop domain, shopify domain

**Reinstall**:
A merchant installing the app again after an uninstall. It begins a new installation period for the same Shop.
_Avoid_: re-auth, second install

**Shopify Plan**:
The merchant's Shopify subscription (for example Basic or Shopify Plus), recorded on the Shop. It is not an app billing plan.
_Avoid_: plan, subscription, billing plan

**Session**:
The offline OAuth session for one shop. Its id is `offline_<shop>`.
_Avoid_: access token, staff user, online session

**GDPR Request**:
A persisted mandatory compliance webhook (`customers/data_request`, `customers/redact` or `shop/redact`), recorded as `pending` before it is acted on and kept as audit evidence afterwards.
_Avoid_: GDPR webhook, compliance event
