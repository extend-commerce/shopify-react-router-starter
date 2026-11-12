import { api } from 'app/http/app';

import { type Route } from './+types/api.$';

// Hands every /api/* request to the Hono app. Don't add other app/routes/api.* files: React
// Router would match them first and Hono would never see those paths.
export function loader({ request, context }: Route.LoaderArgs) {
  return api.fetch(request, context.cloudflare.env, context.cloudflare.ctx);
}

export function action({ request, context }: Route.ActionArgs) {
  return api.fetch(request, context.cloudflare.env, context.cloudflare.ctx);
}
