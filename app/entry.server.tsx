import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';
import logger from './lib/logger';
import { addDocumentResponseHeaders } from './shopify.server';

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get('user-agent');
  const isBotRequest = isbot(userAgent ?? '');

  let shellRendered = false;
  const body = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      signal: request.signal,
      onError(error: unknown) {
        responseStatusCode = 500;
        // Errors thrown before the shell finishes are already caught above and reported by
        // React; errors after the shell has flushed are only reported here.
        if (shellRendered) {
          logger.error(error);
        }
      },
    },
  );
  shellRendered = true;

  if (isBotRequest) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
