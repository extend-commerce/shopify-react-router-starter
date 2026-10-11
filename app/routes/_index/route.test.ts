import { describe, expect, it } from 'vitest';
import { loader } from './route';

async function runLoader(url: string, headers?: HeadersInit) {
  try {
    return await loader({
      request: new Request(url, { headers }),
      params: {},
      context: {},
    } as Parameters<typeof loader>[0]);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

describe('index loader', () => {
  it('forwards the admin launch params to /app', async () => {
    const response = await runLoader(
      'https://example.com/?shop=a.myshopify.com&host=abc&id_token=xyz',
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe(
      '/app?shop=a.myshopify.com&host=abc&id_token=xyz',
    );
  });

  it('sends App Bridge client navigations to /app', async () => {
    const response = await runLoader('https://example.com/', { Authorization: 'Bearer token' });

    expect((response as Response).headers.get('Location')).toBe('/app');
  });

  it('ignores non-bearer authorization headers', async () => {
    await expect(
      runLoader('https://example.com/', { Authorization: 'Basic abc' }),
    ).resolves.toBeNull();
  });

  it('renders the landing page outside the admin', async () => {
    await expect(runLoader('https://example.com/')).resolves.toBeNull();
  });
});
