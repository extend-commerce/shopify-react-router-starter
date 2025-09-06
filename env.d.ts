/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly DATABASE_URL?: string;

    // PostHog
    readonly POSTHOG_PROJECT_API_KEY?: string;
    readonly POSTHOG_API_HOST?: string;

    // Shopify
    readonly SHOPIFY_API_KEY?: string;
    readonly SHOPIFY_API_SECRET?: string;
    readonly SCOPES?: string;
    readonly SHOPIFY_APP_URL?: string;
    readonly SHOP_CUSTOM_DOMAIN?: string;
  }
}
