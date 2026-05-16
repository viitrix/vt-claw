import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../../src/api/client.js';
import { WeixinSDKError, ErrorCode } from '../../src/core/errors.js';
import type { WeixinConfig } from '../../src/core/types.js';

describe('ApiClient', () => {
  const defaultConfig: WeixinConfig = {
    baseUrl: 'https://api.example.com',
    cdnBaseUrl: 'https://cdn.example.com',
  };

  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates client with config', () => {
      const client = new ApiClient(defaultConfig);
      expect(client).toBeInstanceOf(ApiClient);
    });

    it('uses default timeout of 30000ms when not specified', () => {
      const client = new ApiClient(defaultConfig);
      expect(client).toBeDefined();
    });

    it('uses custom timeout from config', () => {
      const client = new ApiClient({ ...defaultConfig, timeout: 5000 });
      expect(client).toBeDefined();
    });
  });

  describe('setAuthToken', () => {
    it('sets auth token for subsequent requests', async () => {
      const client = new ApiClient(defaultConfig);
      client.setAuthToken('test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ data: 'success' }),
      });

      await client.request({ method: 'GET', path: '/test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });
  });

  describe('request', () => {
    it('makes GET request', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-custom': 'value' }),
        json: () => Promise.resolve({ result: 'ok' }),
      });

      const response = await client.request<{ result: string }>({
        method: 'GET',
        path: '/test',
      });

      expect(response.data).toEqual({ result: 'ok' });
      expect(response.status).toBe(200);
      expect(response.headers.get('x-custom')).toBe('value');
    });

    it('makes POST request with JSON body', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ id: 1 }),
      });

      const response = await client.request<{ id: number }>({
        method: 'POST',
        path: '/create',
        data: { name: 'test' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/create',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'test',
            base_info: { channel_version: 'weixin-sdk/1.0.0' },
          }),
        })
      );
      expect(response.data).toEqual({ id: 1 });
    });

    it('adds required Weixin protocol headers', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({}),
      });

      await client.request({ method: 'POST', path: '/test', data: {} });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            AuthorizationType: 'ilink_bot_token',
            'X-WECHAT-UIN': expect.any(String),
            'Content-Length': expect.any(String),
          }),
        })
      );
    });

    it('allows custom headers', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({}),
      });

      await client.request({
        method: 'GET',
        path: '/test',
        headers: { 'X-Custom': 'custom-value' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'custom-value',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('handles HTTP error responses', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      try {
        await client.request({ method: 'GET', path: '/notfound' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WeixinSDKError);
        expect((error as WeixinSDKError).code).toBe(ErrorCode.API_ERROR);
      }
    });

    it('handles network errors', async () => {
      const client = new ApiClient({ ...defaultConfig, retries: 0 });

      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      try {
        await client.request({ method: 'GET', path: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WeixinSDKError);
        expect((error as WeixinSDKError).code).toBe(ErrorCode.NETWORK_ERROR);
      }
    });

    it('handles timeout with AbortController', async () => {
      const client = new ApiClient({ ...defaultConfig, timeout: 50 });

      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const error = new Error('The user aborted a request.');
            error.name = 'AbortError';
            setTimeout(() => reject(error), 100);
          })
      );

      try {
        await client.request({ method: 'GET', path: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WeixinSDKError);
        expect((error as WeixinSDKError).code).toBe(ErrorCode.TIMEOUT);
      }
    });

    it('supports custom timeout per request', async () => {
      const client = new ApiClient({ ...defaultConfig, timeout: 5000 });

      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const error = new Error('The user aborted a request.');
            error.name = 'AbortError';
            setTimeout(() => reject(error), 100);
          })
      );

      try {
        await client.request({ method: 'GET', path: '/test', timeout: 50 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WeixinSDKError);
        expect((error as WeixinSDKError).code).toBe(ErrorCode.TIMEOUT);
      }
    });

    it('retries on network failure with exponential backoff', async () => {
      const client = new ApiClient({ ...defaultConfig, retries: 2 });

      mockFetch
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({ success: true }),
        });

      const response = await client.request<{ success: boolean }>({
        method: 'GET',
        path: '/test',
      });

      expect(response.data).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on 5xx server errors', async () => {
      const client = new ApiClient({ ...defaultConfig, retries: 1 });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({ recovered: true }),
        });

      const response = await client.request<{ recovered: boolean }>({
        method: 'GET',
        path: '/test',
      });

      expect(response.data).toEqual({ recovered: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 4xx client errors', async () => {
      const client = new ApiClient({ ...defaultConfig, retries: 3 });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: () => Promise.resolve({ error: 'Bad request' }),
      });

      try {
        await client.request({ method: 'GET', path: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WeixinSDKError);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      }
    });

    it('throws after max retries exhausted', async () => {
      const client = new ApiClient({ ...defaultConfig, retries: 2 });

      mockFetch.mockRejectedValue(new Error('Network failure'));

      try {
        await client.request({ method: 'GET', path: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WeixinSDKError);
        expect((error as WeixinSDKError).code).toBe(ErrorCode.NETWORK_ERROR);
        expect(mockFetch).toHaveBeenCalledTimes(3);
      }
    });

    it('handles rate limit (429) with specific error code', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: () => Promise.resolve({}),
      });

      try {
        await client.request({ method: 'GET', path: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WeixinSDKError);
        expect((error as WeixinSDKError).code).toBe(ErrorCode.RATE_LIMIT);
      }
    });

    it('handles PUT requests', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ updated: true }),
      });

      await client.request({ method: 'PUT', path: '/update', data: { id: 1 } });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('handles DELETE requests', async () => {
      const client = new ApiClient(defaultConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ deleted: true }),
      });

      await client.request({ method: 'DELETE', path: '/delete/1' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
