import { defineConfig } from 'vitest/config';

// Workers inherit this, and ICU reads it at startup: pages that format with the default locale
// (e.g. prices via Intl.NumberFormat) snapshot the same on every machine.
process.env.LC_ALL = 'en_US.UTF-8';

// Kept apart from vite.config.ts: the Cloudflare and React Router plugins build a Worker and
// route manifest, neither of which tests need. Tests import route modules directly instead.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Clear mocks between tests so call counts don't leak from one test to the next.
    clearMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['app/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'happy-dom',
          include: ['app/**/*.test.tsx'],
          setupFiles: ['./test/setup-ui.ts'],
        },
      },
    ],
  },
});
