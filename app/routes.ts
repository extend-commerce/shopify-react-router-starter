import { flatRoutes } from '@react-router/fs-routes';

// Tests sit next to the routes they cover; keep them out of the route tree.
export default flatRoutes({
  ignoredRouteFiles: ['**/*.test.ts'],
});
