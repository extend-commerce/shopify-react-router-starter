# Embedded app

Language for a merchant's install of this Shopify app.

## Language

**Shop**:
The merchant's `*.myshopify.com` domain. One shop is one tenant.
_Avoid_: store, shop domain, shopify domain

**Session**:
The offline OAuth session for one shop. Its id is `offline_<shop>`.
_Avoid_: access token, staff user, online session

**GDPR Request**:
A persisted mandatory compliance webhook (`customers/data_request`, `customers/redact` or `shop/redact`), recorded as `pending` before it is acted on and kept as audit evidence afterwards.
_Avoid_: GDPR webhook, compliance event
