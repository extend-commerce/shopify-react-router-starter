import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Throwaway D1 validation suite (see VALIDATION.md). Kept apart from the starter's own
// vitest.config.ts, which only runs app/**/*.test.ts with mocked persistence.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./support/cloudflare-workers.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['validation/**/*.test.ts'],
    setupFiles: ['validation/support/setup.ts'],
    clearMocks: true,
    // Each test file starts a Miniflare instance; give workerd time to boot.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
