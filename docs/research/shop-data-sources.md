# Where Shop data comes from

Research for [#4](https://github.com/extend-commerce/shopify-react-router-starter/issues/4)
(map [#3](https://github.com/extend-commerce/shopify-react-router-starter/issues/3)).
Researched 2026-10-11 against Admin API **2026-10** (the version shopify.dev marks `latest`).

**Question:** What Shop data can the app get from the Admin GraphQL `shop` query and from the
`shop/update` webhook? How do the two map to each other and to Gadget's `shopifyShop` fields?

## Answer in brief

- **The `shop` query needs no access scope.** Its reference page lists no "Requires … access
  scope" line, unlike pages such as `shopLocales` that do [S2][S7]. Two adjacent lookups do need
  scopes: `accountOwner` resolves to `StaffMember`, which needs `read_users` and is restricted to
  Plus/Advanced stores or finance apps [S8]. The primary locale lives on `shopLocales`, which needs
  `read_locales` or `read_markets_home` [S7].
- **The `shop/update` topic needs no scope either.** Its `WebhookSubscriptionTopic.SHOP_UPDATE`
  entry has no "Requires" clause, while neighbours like `LOCALES_UPDATE` do ("Requires the
  `read_locales` scope") [S4].
- **The webhook payload is the legacy REST `Shop` resource,** a flat object of 55 snake_case keys
  [S5]. The REST Shop reference maps each REST property to its GraphQL replacement, or marks it
  deprecated or "to be deprecated" [S6]. That mapping is the main source for the table below.
- **`app/uninstalled` sends the same payload,** with the same 55 keys as `shop/update` [S5]. So the
  uninstall webhook also delivers a full Shop snapshot.
- **GraphQL is richer; the webhook is pushed.** Of Gadget's 71 Shop data fields:
  - 39 are available from both sources.
  - **20 come only from GraphQL** (`alerts`, `plan`, `shopAddress`, `currencyFormats`,
    `resourceLimits`, `customerAccountsV2`, timezone offsets, `unitSystem`, `url`, …).
  - **12 come only from the webhook.** Every one of them is deprecated, hard-coded, or marked
    "to be deprecated" in the REST docs, with no GraphQL replacement [S6].

  The webhook is a push on change; GraphQL is a pull that needs a valid offline token. The docs
  only say `shop/update` "occurs whenever a shop is updated" [S4]. They don't say whether it fires
  when only GraphQL-only data changes, such as `alerts` or `resourceLimits`.
- **The schema didn't change for Gadget's version.** Introspecting `Shop`, `ShopPlan` and
  `ShopAddress` on 2026-04 (Gadget's pinned version) and 2026-10 differs by one added field,
  `Shop.analyticsAnnotations` [S1].

## Sources

| ID | Source | Trust |
| - | - | - |
| S1 | Live Admin GraphQL introspection at `https://shopify.dev/admin-graphql-direct-proxy/2026-10` (and `/2026-04`) for `Shop`, `ShopPlan`, `ShopAddress`, `CurrencyFormats`, `ShopFeatures`, `ShopResourceLimits`, `CustomerAccountsV2`, `CountriesInShippingZones`, `ShopAlert`, `OnlineStore`, `ShopLocale`, `WebhookSubscriptionTopic`, plus enums | Primary (schema) |
| S2 | [`shop` query, 2026-10](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/shop) and [`Shop` object](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Shop) | Primary (docs) |
| S3 | [`onlineStore` query, 2026-10](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/onlineStore) | Primary (docs) |
| S4 | [`WebhookSubscriptionTopic` enum, 2026-10](https://shopify.dev/docs/api/admin-graphql/2026-10/enums/WebhookSubscriptionTopic) (topic descriptions, required scopes) | Primary (schema/docs) |
| S5 | [Webhooks reference, 2026-10](https://shopify.dev/docs/api/webhooks/2026-10) (`shop/update` and `app/uninstalled` sample payloads) | Primary (docs) |
| S6 | [REST Admin `Shop` resource, 2026-10](https://shopify.dev/docs/api/admin-rest/2026-10/resources/shop): per-property descriptions and the official `read_graphql_path` mapping (decoded from the page's data, including the 44 fields hidden behind "Show hidden fields") | Primary (docs) |
| S7 | [`shopLocales` query](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/shopLocales) and [`ShopLocale` object](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShopLocale) | Primary (docs) |
| S8 | [`StaffMember` object](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/StaffMember) | Primary (docs) |
| S9 | Gadget starter: `api/models/shopifyShop/schema.gadget.ts` and the generated `.gadget/server/dist-esm/metadata.js`, which records each field's Gadget type and backing key (REST key, or `__gadget_graphql_*` for GraphQL-sourced fields) | Primary (reference implementation) |

## Field table

**Columns.**

- **Gadget**: the `shopifyShop` field name and its Gadget type [S9].
- **GraphQL**: the path from the `shop` query root, with its 2026-10 type [S1].
- **Webhook key**: the key in the `shop/update` payload [S5].
- **Scope**: the access scope needed beyond a valid Admin API token. `none` means no scope is
  documented.

**Status words in the notes column.**

- **DEPRECATED**: marked deprecated in the GraphQL schema.
- **REST: deprecated**: the REST docs mark the property deprecated.
- **REST: to be deprecated**: the REST docs say it has no GraphQL path and is slated for removal.

**Sample-payload caveat.** The `shop/update` sample in [S5] has `null` for keys that are never null
in practice (`myshopify_domain`, `created_at`, `iana_timezone`). The REST resource example [S6] is
the better guide to webhook value shapes.

### A. In both sources (39)

| Gadget (type) | GraphQL (2026-10 type) | Webhook key (JSON type) | Scope | Notes |
| - | - | - | - | - |
| `address1` (String) | `shopAddress.address1` (String) | `address1` (string) | none | `billingAddress.address1` also exists but `billingAddress` is DEPRECATED. |
| `address2` (String) | `shopAddress.address2` (String) | `address2` (string\|null) | none | |
| `checkoutApiSupported` (Boolean) | `checkoutApiSupported` (Boolean!) | `checkout_api_supported` (boolean) | none | |
| `city` (String) | `shopAddress.city` (String) | `city` (string) | none | |
| `country` (String) | `shopAddress.country` (String) | `country` (string) | none | The meanings differ. REST `country` "in most cases … matches the `country_code`" (both samples show `"US"`). GraphQL `ShopAddress.country` is the country *name*. The REST docs map both `country` and `country_name` to it [S6]. |
| `countryCode` (String) | `shopAddress.countryCodeV2` (CountryCode enum) | `country_code` (string) | none | `ShopAddress.countryCode` is DEPRECATED; use `countryCodeV2`. |
| `countryName` (String) | `shopAddress.country` (String) | `country_name` (string) | none | |
| `currency` (Enum) | `currencyCode` (CurrencyCode!) | `currency` (string, ISO 4217) | none | |
| `customerEmail` (String) | `contactEmail` (String!) | `customer_email` (string) | none | The GraphQL name differs. |
| `domain` (String) | `primaryDomain.host` (Domain!.host String!) | `domain` (string) | none | REST maps `domain` to `Shop.primaryDomain` [S6]; select `host` (or `url`). `Shop.domains` is DEPRECATED (use `domainsPaginated`). |
| `email` (String) | `email` (String!) | `email` (string) | none | Shop owner's email (Shopify → merchant). |
| `enabledPresentmentCurrencies` (Enum[]) | `enabledPresentmentCurrencies` ([CurrencyCode!]!) | `enabled_presentment_currencies` (string[]) | none | |
| `hasStorefront` (Boolean) | `features.storefront` (Boolean!) | `has_storefront` (boolean) | none | REST maps this to the root `onlineStore` query [S6]. That query only exposes `passwordProtection` [S1][S3]. `ShopFeatures.storefront` ("Whether a shop has an online store") is the direct Shop-level match. That match is an inference from the descriptions, not a documented mapping. |
| `ianaTimezone` (String) | `ianaTimezone` (String!) | `iana_timezone` (string) | none | The best timezone field to store. |
| `latitude` (Number) | `shopAddress.latitude` (Float) | `latitude` (number\|null) | none | |
| `longitude` (Number) | `shopAddress.longitude` (Float) | `longitude` (number\|null) | none | |
| `marketingSmsContentEnabledAtCheckout` (Boolean) | `marketingSmsConsentEnabledAtCheckout` (Boolean!) | `marketing_sms_consent_enabled_at_checkout` (boolean) | none | Gadget's API name misspells "Consent" as "Content". Its backing key is the `consent` REST key [S9]. |
| `moneyFormat` (String) | `currencyFormats.moneyFormat` (FormattedString!) | `money_format` (string) | none | |
| `moneyInEmailsFormat` (String) | `currencyFormats.moneyInEmailsFormat` (String!) | `money_in_emails_format` (string) | none | The REST docs mis-map this to `CurrencyFormats.moneyFormat` [S6]. The schema has a dedicated `moneyInEmailsFormat` [S1]. |
| `moneyWithCurrencyFormat` (String) | `currencyFormats.moneyWithCurrencyFormat` (FormattedString!) | `money_with_currency_format` (string) | none | |
| `moneyWithCurrencyInEmailsFormat` (String) | `currencyFormats.moneyWithCurrencyInEmailsFormat` (String!) | `money_with_currency_in_emails_format` (string) | none | |
| `myshopifyDomain` (String) | `myshopifyDomain` (String!) | `myshopify_domain` (string) | none | The natural key. It is also in every webhook's `X-Shopify-Shop-Domain` header [S5]. |
| `name` (String) | `name` (String!) | `name` (string) | none | |
| `passwordEnabled` (Boolean) | *(root)* `onlineStore.passwordProtection.enabled` (Boolean!) | `password_enabled` (boolean) | none | Not on `Shop`; it needs a second root field in the same query [S3][S6]. No scope is documented. |
| `phone` (String) | `shopAddress.phone` (String, E.164) | `phone` (string) | none | |
| `planDisplayName` (String) | `plan.displayName` (String!) **DEPRECATED** | `plan_display_name` (string) | none | GraphQL says use `plan.publicDisplayName` instead [S1]. |
| `primaryLocale` (String) | *(root)* `shopLocales` → `locale` of the entry with `primary: true` | `primary_locale` (string) | **`read_locales` or `read_markets_home`** | Not on `Shop` [S6][S7]. This is the only Gadget field whose GraphQL source needs a scope. The webhook carries it for free. |
| `province` (String) | `shopAddress.province` (String) | `province` (string) | none | |
| `provinceCode` (String) | `shopAddress.provinceCode` (String) | `province_code` (string) | none | |
| `setupRequired` (Boolean) | `setupRequired` (Boolean!) | `setup_required` (boolean) | none | |
| `shopOwner` (String) | `shopOwnerName` (String!) | `shop_owner` (string) | none | The GraphQL name differs. |
| `shopifyCreatedAt` (DateTime) | `createdAt` (DateTime!) | `created_at` (ISO 8601 string) | none | |
| `shopifyUpdatedAt` (DateTime) | `updatedAt` (DateTime!) | `updated_at` (ISO 8601 string) | none | Useful to drop stale or out-of-order `shop/update` deliveries. |
| `taxShipping` (Boolean) | `taxShipping` (Boolean!) | `tax_shipping` (boolean\|null) | none | |
| `taxesIncluded` (Boolean) | `taxesIncluded` (Boolean!) | `taxes_included` (boolean\|null) | none | REST: "Valid values: true or null". |
| `timezone` (String) | `timezoneAbbreviation` (String!) | `timezone` (string) | none | The REST docs map it this way [S6], but the formats differ. REST gives `"(GMT-05:00) Eastern Time (US & Canada)"`; GraphQL gives an abbreviation. GraphQL has no exact equivalent; prefer `ianaTimezone`. |
| `transactionalSmsDisabled` (Boolean) | `transactionalSmsDisabled` (Boolean!) | `transactional_sms_disabled` (boolean) | none | |
| `weightUnit` (Enum) | `weightUnit` (WeightUnit!: `KILOGRAMS`/`GRAMS`/`POUNDS`/`OUNCES`) | `weight_unit` (string: `"kg"`, `"lb"`, …) | none | The value vocabularies differ between sources. |
| `zipCode` (String) | `shopAddress.zip` (String) | `zip` (string) | none | |

### B. Only in the `shop/update` webhook (12)

None of these has a GraphQL path in 2026-10 [S6]. Every one is deprecated, hard-coded, or "to be
deprecated" in the REST docs.

| Gadget (type) | GraphQL | Webhook key (JSON type) | Scope | Notes |
| - | - | - | - | - |
| `countyTaxes` (JSON) | — | `county_taxes` (boolean\|null) | none | REST: deprecated. US-only, "true or null". |
| `eligibleForPayments` (Boolean) | — | `eligible_for_payments` (boolean) | none | REST: to be deprecated. |
| `finances` (Boolean) | — | `finances` (boolean) | none | REST: deprecated, "Hardcoded to true". |
| `googleAppsDomain` (String) | — | `google_apps_domain` (string\|null) | none | REST: to be deprecated. |
| `googleAppsLoginEnabled` (Boolean) | — | `google_apps_login_enabled` (boolean\|null) | none | REST: to be deprecated. |
| `hasDiscounts` (Boolean) | — | `has_discounts` (boolean) | none | REST: to be deprecated. |
| `hasGiftCards` (Boolean) | — | `has_gift_cards` (boolean) | none | REST: to be deprecated. `features.giftCards` exists but means "can create gift cards", not "has active gift cards". |
| `multiLocationEnabled` (Boolean) | — | `multi_location_enabled` (boolean) | none | REST: deprecated, "Hardcoded to true". |
| `planName` (String) | — | `plan_name` (string, e.g. `"enterprise"`) | none | REST: to be deprecated. For "dev store?" or "Plus?" checks, GraphQL has `plan.partnerDevelopment` and `plan.shopifyPlus` (Boolean!). |
| `preLaunchEnabled` (Boolean) | — | `pre_launch_enabled` (boolean) | none | REST: to be deprecated. |
| `requiresExtraPaymentsAgreement` (Boolean) | — | `requires_extra_payments_agreement` (boolean) | none | REST: to be deprecated. |
| `source` (String) | — | `source` (string\|null) | none | REST: to be deprecated. Partner referral handle. |

### C. Only in the GraphQL `shop` query (20)

| Gadget (type) | GraphQL (2026-10 type) | Webhook key | Scope | Notes |
| - | - | - | - | - |
| `alerts` (JSON) | `alerts` ([ShopAlert!]!: `{action, description}`) | — | none | |
| `billingAddress` (JSON) | `billingAddress` (ShopAddress!) **DEPRECATED** | — | none | "Use `shopAddress` instead." |
| `countriesInShippingZones` (JSON) | `countriesInShippingZones` (`{countryCodes: [CountryCode!]!, includeRestOfWorld: Boolean!}`) | — | none | |
| `currencyFormats` (JSON) | `currencyFormats` (CurrencyFormats!) | — (its 4 members arrive as flat `money_*` keys) | none | Duplicates `moneyFormat` and friends in table A. |
| `customerAccounts` (Enum) | `customerAccounts` (ShopCustomerAccountsSetting!: `REQUIRED`/`OPTIONAL`/`DISABLED`) | — | none | Not deprecated, but `customerAccountsV2` is the newer shape. |
| `customerAccountsV2` (JSON) | `customerAccountsV2` (`{customerAccountsVersion, loginLinksVisibleOnStorefrontAndCheckout, loginRequiredAtCheckout, url}`) | — | none | |
| `description` (String) | `description` (String, nullable) | — | none | SEO meta description. |
| `orderNumberFormatPrefix` (String) | `orderNumberFormatPrefix` (String!) | — | none | |
| `orderNumberFormatSuffix` (String) | `orderNumberFormatSuffix` (String!) | — | none | |
| `plan` (JSON) | `plan` (ShopPlan!: `{displayName` DEPRECATED`, partnerDevelopment, publicDisplayName, shopifyPlus}`) | — (only `plan_display_name`, `plan_name`) | none | `features.shopifyPlus` is DEPRECATED in favour of `plan.shopifyPlus`. |
| `planPublicDisplayName` (String) | `plan.publicDisplayName` (String!) | — | none | Values: Advanced, Basic, Development, Grow, Plus, Trial, … [S1]. |
| `resourceLimits` (JSON) | `resourceLimits` (`{locationLimit, maxProductOptions, maxProductVariants, redirectLimitReached}`) | — | none | |
| `richTextEditorUrl` (URL) | `richTextEditorUrl` (URL!) | — | none | |
| `shipsToCountries` (Enum[]) | `shipsToCountries` ([CountryCode!]!) | — | none | |
| `shopAddress` (JSON) | `shopAddress` (ShopAddress!) | — (flat address keys instead) | none | Duplicates the address fields in table A. Nested fields `countryCode`, `firstName`, `lastName`, `name` are DEPRECATED (the last three are "Always null"). |
| `timezoneAbbreviation` (String) | `timezoneAbbreviation` (String!) | — | none | REST `timezone` is mapped here, but its format differs (see table A). |
| `timezoneOffset` (String) | `timezoneOffset` (String!) | — | none | |
| `timezoneOffsetMinutes` (Number) | `timezoneOffsetMinutes` (Int!) | — | none | |
| `unitSystem` (Enum) | `unitSystem` (UnitSystem!: `IMPERIAL_SYSTEM`/`METRIC_SYSTEM`) | — | none | |
| `url` (URL) | `url` (URL!) | — | none | Online store URL. `storefrontUrl` is DEPRECATED in favour of `url`. |

### D. Gadget fields that are not Shop data

- **`appSubscriptions`, `gdprRequests`, `syncs`** are Gadget relationships, not data from either
  source.
- **`chargeId` and `mantleApiToken`** are Gadget custom fields. Map #3 already drops them.
- **Hidden system fields.** Gadget's generated metadata also shows fields that aren't in
  `schema.gadget.ts` [S9]: `accessToken`, `accessTokenExpiresAt`, `refreshToken`,
  `refreshTokenExpiresAt`, `grantedScopes`, `installedViaApiKey`, `shopSpecificRegistration`.
  They come from OAuth/token exchange, not from either Shop source. In this starter, the `session`
  table plays that role.

## In the sources but not in Gadget

- **Webhook-only keys.**
  - `id`: numeric shop ID. GraphQL `id` is a GID, `gid://shopify/Shop/<id>`.
  - `auto_configure_tax_inclusivity`: REST: to be deprecated.
  - `primary_location_id`: REST: deprecated; use Locations.
  - `marketing_email_consent_enabled_at_checkout`: the REST docs map it to
    `Shop.marketingEmailConsentEnabledAtCheckout`, but **that field does not exist in the 2026-10
    schema** [S1]. In practice it is webhook-only.
- **GraphQL-only fields worth knowing about.**
  - `id` (ID!).
  - `plan.shopifyPlus` and `plan.partnerDevelopment`.
  - `features` (ShopFeatures, around 30 capability flags).
  - `primaryDomain` (`host`, `url`, `sslEnabled`).
  - `contactEmail`.
  - `accountOwner`: needs `read_users`, which is restricted to Plus/Advanced stores or finance
    apps [S8].
  - `paymentSettings`, `entitlements`, `shopPolicies`, `metafields`.
- **Deprecated connections to avoid on `Shop`.** Many connections (`products`, `orders`,
  `customers`, `locations`, …) are DEPRECATED in favour of the matching `QueryRoot` fields [S1].
  They are not Shop data.

## Implications for the Shop fields ticket

These are recommendations drawn from the facts above, not from Shopify docs.

- **Use GraphQL as the canonical source.** Every live, non-deprecated Shop attribute is reachable
  through it with no scope, except `primaryLocale` (`read_locales`). Every webhook-only field is on
  its way out.
- **Use `shop/update` as a trigger.** If a field chosen for the table is GraphQL-only, the handler
  must re-query `shop` with the stored offline token. If the chosen fields are all in table A, the
  handler can map the payload directly. Expect the vocabulary differences noted above: `weight_unit`
  vs `weightUnit`, `country`, `timezone`, and numeric vs GID `id`.
- **Remember the uninstall payload.** `app/uninstalled` carries the same 55-key snapshot, so the
  uninstall handler can update the row without an API call. That matters because the app's access
  token stops working after uninstall. The token point comes from general Shopify app behaviour,
  not from the sources above.
- **Watch the locale scope.** Storing `primaryLocale` from GraphQL means adding `read_locales` to
  the app's scopes. Taking it from webhooks only means it is unavailable on the first install,
  before any `shop/update` has arrived.
