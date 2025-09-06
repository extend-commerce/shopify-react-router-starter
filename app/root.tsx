import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react';
import { PostHogProvider } from './lib/posthog/provider';
import styles from './styles.css?url';

export const links = () => [{ rel: 'stylesheet', href: styles }];

export function loader() {
  return {
    POSTHOG_PROJECT_API_KEY: process.env.POSTHOG_PROJECT_API_KEY,
    POSTHOG_API_HOST: process.env.POSTHOG_API_HOST,
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
  };
}

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <PostHogProvider>
          <Outlet />
        </PostHogProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
