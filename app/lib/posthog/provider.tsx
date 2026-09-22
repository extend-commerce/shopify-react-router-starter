import { useLoaderData } from 'react-router';
import posthog from 'posthog-js';
import { PostHogProvider as PostHogProviderReact } from 'posthog-js/react';
import { type PropsWithChildren, useEffect, useState } from 'react';

interface RootLoaderData {
  POSTHOG_PROJECT_API_KEY: string;
  POSTHOG_API_HOST: string;
  IS_PRODUCTION: boolean;
}

export function PostHogProvider({ children }: PropsWithChildren) {
  const { POSTHOG_PROJECT_API_KEY, POSTHOG_API_HOST, IS_PRODUCTION } =
    useLoaderData<RootLoaderData>();

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!IS_PRODUCTION) return;

    if (!POSTHOG_PROJECT_API_KEY) {
      throw new Error('POSTHOG_PROJECT_API_KEY must be set');
    }

    if (!POSTHOG_API_HOST) {
      throw new Error('POSTHOG_API_HOST must be set');
    }

    posthog.init(POSTHOG_PROJECT_API_KEY, {
      api_host: POSTHOG_API_HOST,
      defaults: '2025-05-24',
    });

    setHydrated(true);
  }, [IS_PRODUCTION, POSTHOG_API_HOST, POSTHOG_PROJECT_API_KEY]);

  if (!hydrated || !IS_PRODUCTION) return <>{children}</>;
  return (
    <PostHogProviderReact client={posthog}>{children}</PostHogProviderReact>
  );
}
