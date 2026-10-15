// Staging sets NODE_ENV=staging (see wrangler.production.jsonc `previews`), so only production counts here.
export const isProduction = process.env.NODE_ENV === 'production';
