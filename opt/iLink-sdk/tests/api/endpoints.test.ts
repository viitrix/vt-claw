import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiEndpoints } from '../../src/api/endpoints.js';
import { ApiClient } from '../../src/api/client.js';
import type { WeixinConfig } from '../../src/core/types.js';
import { WeixinSDKError, ErrorCode } from '../../src/core/errors.js';
import type {
  GetUpdatesReq,
  GetUpdatesResp,
  SendMessageReq,
  SendMessageResp,
  GetUploadUrlReq,
  GetUploadUrlResp,
  SendTypingReq,
  SendTypingResp,
  GetConfigResp,
} from '../../src/api/types.js';

describe('ApiEndpoints', () => {
  const defaultConfig: WeixinConfig = {
    baseUrl: 'https://api.example.com',
    cdnBaseUrl: 'https://cdn.example.com',
  };

  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;
  let endpoints: ApiEndpoints;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    client = new ApiClient(defaultConfig);
    endpoints = new ApiEndpoints(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('getUpdates', () => {
    it('calls POST /ilink/bot/getupdates', async () => {
      const mockResponse: GetUpdatesResp = {
        ret: 0,
        msgs: [],
        get_updates_buf: 'buffer123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResponse),
      });

      const params: GetUpdatesReq = { get_updates_buf: '' };
      const result = await endpoints.getUpdates(params);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/ilink/bot/getupdates',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            get_updates_buf: '',
            base_info: { channel_version: 'weixin-sdk/1.0.0' },
          }),
        })
      );
    });

    it('returns empty result on long-poll timeout', async () => {
      const timeoutError = new WeixinSDKError(ErrorCode.TIMEOUT, 'Request timed out');
      vi.spyOn(client, 'request').mockRejectedValueOnce(timeoutError);

      const result = await endpoints.getUpdates({ get_updates_buf: 'buf' });

      expect(result).toEqual({
        ret: 0,
        msgs: [],
        get_updates_buf: 'buf',
      });
    });
  });

  describe('sendMessage', () => {
    it('calls POST /ilink/bot/sendmessage', async () => {
      const mockResponse: SendMessageResp = {};

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResponse),
      });

      const message: SendMessageReq = {
        msg: {
          from_user_id: 'bot1',
          to_user_id: 'user1',
          message_type: 1,
          item_list: [{ type: 1, text_item: { text: 'Hello' } }],
        },
      };

      const result = await endpoints.sendMessage(message);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/ilink/bot/sendmessage',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ...message,
            base_info: { channel_version: 'weixin-sdk/1.0.0' },
          }),
        })
      );
    });
  });

  describe('getUploadUrl', () => {
    it('calls POST /ilink/bot/getuploadurl', async () => {
      const mockResponse: GetUploadUrlResp = {
        upload_param: 'encrypted_param',
        thumb_upload_param: 'thumb_param',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResponse),
      });

      const params: GetUploadUrlReq = {
        filekey: 'test_file',
        media_type: 1,
        rawsize: 1024,
        rawfilemd5: 'abc123',
        filesize: 1040,
      };

      const result = await endpoints.getUploadUrl(params);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/ilink/bot/getuploadurl',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ...params,
            base_info: { channel_version: 'weixin-sdk/1.0.0' },
          }),
        })
      );
    });
  });

  describe('sendTyping', () => {
    it('calls POST /ilink/bot/sendtyping', async () => {
      const mockResponse: SendTypingResp = { ret: 0 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResponse),
      });

      const params: SendTypingReq = {
        ilink_user_id: 'user1',
        typing_ticket: 'ticket123',
        status: 1,
      };

      const result = await endpoints.sendTyping(params);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/ilink/bot/sendtyping',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ...params,
            base_info: { channel_version: 'weixin-sdk/1.0.0' },
          }),
        })
      );
    });

    it('sends cancel typing status', async () => {
      const mockResponse: SendTypingResp = { ret: 0 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResponse),
      });

      const params: SendTypingReq = {
        ilink_user_id: 'user1',
        typing_ticket: 'ticket123',
        status: 2,
      };

      await endpoints.sendTyping(params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            ...params,
            base_info: { channel_version: 'weixin-sdk/1.0.0' },
          }),
        })
      );
    });
  });

  describe('getConfig', () => {
    it('calls POST /ilink/bot/getconfig', async () => {
      const mockResponse: GetConfigResp = {
        ret: 0,
        typing_ticket: 'base64ticket',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await endpoints.getConfig({
        ilink_user_id: 'user1',
        context_token: 'ctx-1',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/ilink/bot/getconfig',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ilink_user_id: 'user1',
            context_token: 'ctx-1',
            base_info: { channel_version: 'weixin-sdk/1.0.0' },
          }),
        })
      );
    });

    it('returns error response when server returns error', async () => {
      const mockResponse: GetConfigResp = {
        ret: -1,
        errmsg: 'Session expired',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await endpoints.getConfig({ ilink_user_id: 'user1' });

      expect(result.ret).toBe(-1);
      expect(result.errmsg).toBe('Session expired');
    });
  });
});
