/**
 * Shopify's `authenticate.*` helpers reject a request by throwing a `Response`: a 400 or 401, or
 * the 204 that answers a CORS preflight. Hono only catches `Error`s, so this hands that Response
 * back as a value for the middleware to return.
 */
export async function catchRejection<T>(promise: Promise<T>): Promise<T | Response> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
