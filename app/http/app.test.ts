import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('/api/* routing', () => {
  // React Router matches a specific route before the splat, so an app/routes/api.* file would
  // take its path away from Hono without any error. API endpoints go in app/http instead.
  it('leaves every /api/* path to app/routes/api.$.ts', () => {
    const routes = readdirSync(join(import.meta.dirname, '../routes'));
    const apiRoutes = routes.filter(file => /^api[.[_]/.test(file) && !file.includes('.test.'));

    expect(apiRoutes).toEqual(['api.$.ts']);
  });
});
