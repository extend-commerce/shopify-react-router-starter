/// <reference types="vite/client" />

declare module 'virtual:react-router/server-build' {
  import { type ServerBuild } from 'react-router';

  const build: ServerBuild;
  export = build;
}

declare namespace NodeJS {
  interface ProcessEnv {
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
