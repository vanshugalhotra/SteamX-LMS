import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api-client';

const mockFetch = (res: Response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON for a 2xx response', async () => {
    mockFetch(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    expect(await apiFetch('/users')).toEqual({ items: [] });
  });

  it('returns null for 204', async () => {
    mockFetch(new Response(null, { status: 204 }));
    expect(await apiFetch('/logout')).toBeNull();
  });

  it('throws ApiError when a 2xx body is not valid JSON', async () => {
    mockFetch(new Response('<html>proxy error</html>', { status: 200 }));
    await expect(apiFetch('/users')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      message: 'Invalid response from server.',
    });
  });

  it('still throws the HTTP error when an error body is not JSON', async () => {
    mockFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    const error = await apiFetch('/users').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });
});
