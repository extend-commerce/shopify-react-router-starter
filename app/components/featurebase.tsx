import { type PrepareUserInfoResult } from 'app/server/user.server';
import Featurebase_ from 'featurebase-js';
import { memo, use, useEffect } from 'react';

interface FeaturebaseProps {
  appId: string;
  userInfo: Promise<PrepareUserInfoResult>;
}

export const Featurebase = memo(function Featurebase({ appId, userInfo }: FeaturebaseProps) {
  const { featurebaseToken, user } = use(userInfo);

  useEffect(() => {
    Featurebase_({
      appId,
      featurebaseJwt: featurebaseToken ?? undefined,
      userId: user?.id.toString(), // Featurebase expects a string
      name: `${user?.first_name} ${user?.last_name}`,
      language: user?.locale,
      email: user?.email,
    });
  }, [appId, featurebaseToken, user]);

  return null;
});
