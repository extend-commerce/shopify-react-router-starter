import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts: the Cloudflare and React Router plugins build a Worker and
// route manifest, neither of which tests need. Tests import route modules directly instead.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
    // Clear mocks between tests so call counts don't leak from one test to the next.
    clearMocks: true,
  },
});
