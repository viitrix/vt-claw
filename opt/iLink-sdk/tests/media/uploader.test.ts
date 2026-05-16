import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaUploader } from '../../src/media/uploader.js';
import { ApiEndpoints } from '../../src/api/endpoints.js';
import { ApiClient } from '../../src/api/client.js';
import type { WeixinConfig } from '../../src/core/types.js';
import type { GetUploadUrlResp } from '../../src/api/types.js';
import fs from 'fs/promises';
import path from 'path';

describe('MediaUploader', () => {
  const defaultConfig: WeixinConfig = {
    baseUrl: 'https://api.example.com',
    cdnBaseUrl: 'https://cdn.example.com',
  };

  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;
  let api: ApiEndpoints;
  let uploader: MediaUploader;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    client = new ApiClient(defaultConfig);
    api = new ApiEndpoints(client);
    uploader = new MediaUploader(api, defaultConfig.cdnBaseUrl);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('calculates file MD5 and size', async () => {
      const tempFile = path.join('/tmp', `test-upload-${Date.now()}.txt`);
      await fs.writeFile(tempFile, 'test content for upload');

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'encrypted_param',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockUploadUrlResp),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-encrypted-param': '123' }),
        });

      const result = await uploader.upload({
        filePath: tempFile,
        mediaType: 1,
        toUserId: 'user1',
      });

      expect(result.fileId).toBe('123');
      expect(result.downloadParam).toBe('123');
      expect(result.aesKey).toMatch(/^[0-9a-f]{32}$/);

      await fs.unlink(tempFile);
    });

    it('requests upload URL with correct parameters', async () => {
      const tempFile = path.join('/tmp', `test-upload-${Date.now()}.txt`);
      await fs.writeFile(tempFile, 'hello');

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'encrypted_param',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockUploadUrlResp),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-encrypted-param': '456' }),
        });

      await uploader.upload({
        filePath: tempFile,
        mediaType: 3,
        toUserId: 'user2',
      });

      const getUploadUrlCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(getUploadUrlCall[1].body);

      expect(requestBody.media_type).toBe(3);
      expect(requestBody.to_user_id).toBe('user2');
      expect(requestBody.rawsize).toBe(5);
      expect(requestBody.rawfilemd5).toBe('5d41402abc4b2a76b9719d911017c592');
      expect(requestBody.filekey).toMatch(/^[0-9a-f]{32}$/);
      expect(typeof requestBody.aeskey).toBe('string');
      expect(requestBody.aeskey.length).toBe(32);
      expect(requestBody.no_need_thumb).toBe(true);

      await fs.unlink(tempFile);
    });

    it('uploads encrypted file to CDN', async () => {
      const tempFile = path.join('/tmp', `test-upload-${Date.now()}.bin`);
      await fs.writeFile(tempFile, Buffer.from([1, 2, 3, 4, 5]));

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'cdn_upload_param',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockUploadUrlResp),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-encrypted-param': '789' }),
        });

      await uploader.upload({
        filePath: tempFile,
        mediaType: 2,
      });

      const cdnCall = mockFetch.mock.calls[1];
      expect(cdnCall[0]).toContain('https://cdn.example.com/upload?encrypted_query_param=');
      expect(cdnCall[0]).toContain('&filekey=');
      expect(cdnCall[1].method).toBe('POST');
      expect(cdnCall[1].body).toBeDefined();

      await fs.unlink(tempFile);
    });

    it('uses custom CDN base URL when provided', async () => {
      const customUploader = new MediaUploader(api, 'https://custom.cdn.com');
      const tempFile = path.join('/tmp', `test-upload-${Date.now()}.txt`);
      await fs.writeFile(tempFile, 'test');

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'param',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockUploadUrlResp),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-encrypted-param': 'abc' }),
        });

      await customUploader.upload({
        filePath: tempFile,
        mediaType: 1,
        cdnBaseUrl: 'https://override.cdn.com',
      });

      const cdnCall = mockFetch.mock.calls[1];
      expect(cdnCall[0]).toContain('https://override.cdn.com');

      await fs.unlink(tempFile);
    });

    it('throws error when file does not exist', async () => {
      await expect(
        uploader.upload({
          filePath: '/nonexistent/file.txt',
          mediaType: 1,
        })
      ).rejects.toThrow();
    });
  });
});
