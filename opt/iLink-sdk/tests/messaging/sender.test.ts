import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageSender } from '../../src/messaging/sender.js';
import { ApiEndpoints } from '../../src/api/endpoints.js';
import { ApiClient } from '../../src/api/client.js';
import { MediaUploader } from '../../src/media/uploader.js';
import type { WeixinConfig } from '../../src/core/types.js';
import type { SendMessageResp, GetUploadUrlResp } from '../../src/api/types.js';
import fs from 'fs/promises';
import path from 'path';

describe('MessageSender', () => {
  const defaultConfig: WeixinConfig = {
    baseUrl: 'https://api.example.com',
    cdnBaseUrl: 'https://cdn.example.com',
  };

  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;
  let api: ApiEndpoints;
  let uploader: MediaUploader;
  let sender: MessageSender;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    client = new ApiClient(defaultConfig);
    api = new ApiEndpoints(client);
    uploader = new MediaUploader(api, defaultConfig.cdnBaseUrl);
    sender = new MessageSender(api, uploader);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('sendText', () => {
    it('sends a text message to a user', async () => {
      const mockResp: SendMessageResp = {};
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await sender.sendText({
        to: 'user123',
        text: 'Hello, World!',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.msg.to_user_id).toBe('user123');
      expect(body.msg.item_list[0].text_item.text).toBe('Hello, World!');
      expect(body.msg.item_list[0].type).toBe(1);
      expect(body.msg.client_id).toEqual(expect.any(String));
      expect(body.msg.message_state).toBe(2);
    });

    it('includes context token when provided', async () => {
      const mockResp: SendMessageResp = {};
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await sender.sendText({
        to: 'user456',
        text: 'Reply message',
        contextToken: 'ctx-token-abc',
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.msg.context_token).toBe('ctx-token-abc');
    });

    it('sets message_type to BOT (2)', async () => {
      const mockResp: SendMessageResp = {};
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await sender.sendText({
        to: 'user789',
        text: 'Bot message',
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.msg.message_type).toBe(2);
    });
  });

  describe('sendMedia', () => {
    it('uploads and sends an image', async () => {
      const tempFile = path.join('/tmp', `test-media-${Date.now()}.jpg`);
      await fs.writeFile(tempFile, Buffer.from([0xff, 0xd8, 0xff]));

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'upload_param_img',
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
          headers: new Headers({ 'x-encrypted-param': 'img123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({}),
        });

      await sender.sendMedia({
        to: 'user123',
        filePath: tempFile,
        mediaType: 1,
      });

      const sendMessageCall = mockFetch.mock.calls[2];
      const body = JSON.parse(sendMessageCall[1].body);
      expect(body.msg.to_user_id).toBe('user123');
      expect(body.msg.item_list[0].type).toBe(2);
      expect(body.msg.item_list[0].image_item.media.encrypt_query_param).toBe('img123');
      expect(Buffer.from(body.msg.item_list[0].image_item.media.aes_key, 'base64').toString('utf-8')).toMatch(/^[0-9a-f]{32}$/);
      expect(body.msg.item_list[0].image_item.media.encrypt_type).toBe(1);

      await fs.unlink(tempFile);
    });

    it('uploads and sends a file with text', async () => {
      const tempFile = path.join('/tmp', `test-media-${Date.now()}.pdf`);
      await fs.writeFile(tempFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'upload_param_file',
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
          headers: new Headers({ 'x-encrypted-param': 'file456' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({}),
        });

      await sender.sendMedia({
        to: 'user456',
        filePath: tempFile,
        mediaType: 3,
        text: 'Here is the document',
      });

      const sendMessageCall = mockFetch.mock.calls[2];
      const body = JSON.parse(sendMessageCall[1].body);
      expect(body.msg.item_list[0].type).toBe(4);
      expect(body.msg.item_list[0].file_item.media.encrypt_query_param).toBe('file456');
      expect(body.msg.item_list[0].file_item.file_name).toBe(path.basename(tempFile));
      expect(body.msg.item_list[1].text_item.text).toBe('Here is the document');

      await fs.unlink(tempFile);
    });

    it('sends provided file name for file media', async () => {
      const tempFile = path.join('/tmp', `test-media-${Date.now()}.bin`);
      await fs.writeFile(tempFile, 'file');

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'upload_param_file',
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
          headers: new Headers({ 'x-encrypted-param': 'file999' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({}),
        });

      await sender.sendMedia({
        to: 'user456',
        filePath: tempFile,
        fileName: 'custom-name.txt',
        mediaType: 3,
      });

      const sendMessageCall = mockFetch.mock.calls[2];
      const body = JSON.parse(sendMessageCall[1].body);
      expect(body.msg.item_list[0].file_item.file_name).toBe('custom-name.txt');

      await fs.unlink(tempFile);
    });

    it('uses custom CDN base URL when provided', async () => {
      const tempFile = path.join('/tmp', `test-media-${Date.now()}.png`);
      await fs.writeFile(tempFile, 'test');

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'upload_param',
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
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({}),
        });

      await sender.sendMedia({
        to: 'user789',
        filePath: tempFile,
        mediaType: 1,
        cdnBaseUrl: 'https://custom.cdn.com',
      });

      const cdnCall = mockFetch.mock.calls[1];
      expect(cdnCall[0]).toContain('https://custom.cdn.com');

      await fs.unlink(tempFile);
    });

    it('includes context token when provided', async () => {
      const tempFile = path.join('/tmp', `test-media-${Date.now()}.gif`);
      await fs.writeFile(tempFile, 'gif');

      const mockUploadUrlResp: GetUploadUrlResp = {
        upload_param: 'upload_param',
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
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({}),
        });

      await sender.sendMedia({
        to: 'user111',
        filePath: tempFile,
        mediaType: 1,
        contextToken: 'media-ctx-token',
      });

      const sendMessageCall = mockFetch.mock.calls[2];
      const body = JSON.parse(sendMessageCall[1].body);
      expect(body.msg.context_token).toBe('media-ctx-token');

      await fs.unlink(tempFile);
    });

    it('throws error when file does not exist', async () => {
      await expect(
        sender.sendMedia({
          to: 'user123',
          filePath: '/nonexistent/file.pdf',
          mediaType: 3,
        })
      ).rejects.toThrow();
    });
  });
});
