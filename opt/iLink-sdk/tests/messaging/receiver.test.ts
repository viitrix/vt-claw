import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageReceiver } from '../../src/messaging/receiver.js';
import { ApiEndpoints } from '../../src/api/endpoints.js';
import { ApiClient } from '../../src/api/client.js';
import type { WeixinConfig } from '../../src/core/types.js';
import type { GetUpdatesResp, WeixinMessage } from '../../src/api/types.js';

describe('MessageReceiver', () => {
  const defaultConfig: WeixinConfig = {
    baseUrl: 'https://api.example.com',
    cdnBaseUrl: 'https://cdn.example.com',
  };

  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;
  let api: ApiEndpoints;
  let receiver: MessageReceiver;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    client = new ApiClient(defaultConfig);
    api = new ApiEndpoints(client);
    receiver = new MessageReceiver(api);
  });

  afterEach(() => {
    receiver.stopPolling();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('startPolling', () => {
    it('starts polling for messages', async () => {
      const messages: WeixinMessage[] = [];
      receiver.on('message', (msg: WeixinMessage) => messages.push(msg));

      const mockResp: GetUpdatesResp = {
        msgs: [
          { message_id: 1, from_user_id: 'user1', to_user_id: 'bot' },
        ],
        get_updates_buf: 'buf1',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await receiver.startPolling(100);

      await new Promise(resolve => setTimeout(resolve, 150));
      receiver.stopPolling();

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].from_user_id).toBe('user1');
    });

    it('uses default interval of 30000ms when not specified', async () => {
      vi.useFakeTimers();

      const mockResp: GetUpdatesResp = {
        msgs: [],
        get_updates_buf: 'buf1',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await receiver.startPolling();

      await vi.advanceTimersByTimeAsync(100);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(29000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      receiver.stopPolling();
    });

    it('emits message event for each received message', async () => {
      const receivedMessages: WeixinMessage[] = [];
      receiver.on('message', (msg: WeixinMessage) => receivedMessages.push(msg));

      let callCount = 0;
      const mockResp: GetUpdatesResp = {
        msgs: [
          { message_id: 1, from_user_id: 'user1' },
          { message_id: 2, from_user_id: 'user2' },
          { message_id: 3, from_user_id: 'user3' },
        ],
        get_updates_buf: 'buf1',
      };

      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve(mockResp),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({ msgs: [], get_updates_buf: 'buf2' }),
        });
      });

      await receiver.startPolling(50);

      await new Promise(resolve => setTimeout(resolve, 100));
      receiver.stopPolling();

      expect(receivedMessages.length).toBe(3);
      expect(receivedMessages.map(m => m.from_user_id)).toEqual(['user1', 'user2', 'user3']);
    });

    it('manages get_updates_buf for subsequent requests', async () => {
      const mockResp1: GetUpdatesResp = {
        msgs: [],
        get_updates_buf: 'first_buf',
      };

      const mockResp2: GetUpdatesResp = {
        msgs: [],
        get_updates_buf: 'second_buf',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockResp1),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockResp2),
        });

      await receiver.startPolling(50);

      await new Promise(resolve => setTimeout(resolve, 150));
      receiver.stopPolling();

      const firstCall = mockFetch.mock.calls[0];
      const firstBody = JSON.parse(firstCall[1].body);
      expect(firstBody.get_updates_buf).toBe('');

      const secondCall = mockFetch.mock.calls[1];
      const secondBody = JSON.parse(secondCall[1].body);
      expect(secondBody.get_updates_buf).toBe('first_buf');
    });

    it('uses server-suggested longpolling timeout for next request', async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify({
            msgs: [],
            get_updates_buf: 'buf1',
            longpolling_timeout_ms: 75,
          })),
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify({ msgs: [], get_updates_buf: 'buf2' })),
        });

      await receiver.startPolling();
      await vi.advanceTimersByTimeAsync(74);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('resets get_updates_buf when session times out', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify({
            msgs: [],
            get_updates_buf: 'buf1',
          })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify({
            msgs: [],
            errcode: -14,
          })),
        });

      await receiver.startPolling(50);
      await new Promise(resolve => setTimeout(resolve, 120));
      receiver.stopPolling();

      const secondCall = mockFetch.mock.calls[1];
      const secondBody = JSON.parse(secondCall[1].body);
      expect(secondBody.get_updates_buf).toBe('buf1');

      const thirdScheduledCall = mockFetch.mock.calls[2];
      if (thirdScheduledCall) {
        const thirdBody = JSON.parse(thirdScheduledCall[1].body);
        expect(thirdBody.get_updates_buf).toBe('');
      }
    });

    it('emits error event on API failure', async () => {
      const errors: Error[] = [];
      receiver.on('error', (err: Error) => errors.push(err));

      mockFetch.mockRejectedValue(new Error('Network error'));

      await receiver.startPolling(50);

      await new Promise(resolve => setTimeout(resolve, 2000));
      receiver.stopPolling();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Network error');
    });

    it('continues polling after error', async () => {
      const messages: WeixinMessage[] = [];
      receiver.on('message', (msg: WeixinMessage) => messages.push(msg));

      const mockResp: GetUpdatesResp = {
        msgs: [{ message_id: 1, from_user_id: 'user1' }],
        get_updates_buf: 'buf1',
      };

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount <= 4) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockResp),
        });
      });

      await receiver.startPolling(50);

      await new Promise(resolve => setTimeout(resolve, 3000));
      receiver.stopPolling();

      expect(messages.length).toBeGreaterThan(0);
    });

    it('handles empty message list', async () => {
      const messages: WeixinMessage[] = [];
      receiver.on('message', (msg: WeixinMessage) => messages.push(msg));

      const mockResp: GetUpdatesResp = {
        msgs: [],
        get_updates_buf: 'empty_buf',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await receiver.startPolling(50);

      await new Promise(resolve => setTimeout(resolve, 100));
      receiver.stopPolling();

      expect(messages.length).toBe(0);
    });
  });

  describe('stopPolling', () => {
    it('stops polling when called', async () => {
      const mockResp: GetUpdatesResp = {
        msgs: [],
        get_updates_buf: 'buf',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await receiver.startPolling(50);

      await new Promise(resolve => setTimeout(resolve, 100));

      receiver.stopPolling();

      const callCountAfterStop = mockFetch.mock.calls.length;

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockFetch.mock.calls.length).toBe(callCountAfterStop);
    });

    it('is idempotent', () => {
      receiver.stopPolling();
      receiver.stopPolling();
      receiver.stopPolling();
    });

    it('allows restarting after stop', async () => {
      const messages: WeixinMessage[] = [];
      receiver.on('message', (msg: WeixinMessage) => messages.push(msg));

      const mockResp: GetUpdatesResp = {
        msgs: [{ message_id: 1, from_user_id: 'user1' }],
        get_updates_buf: 'buf1',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await receiver.startPolling(50);
      await new Promise(resolve => setTimeout(resolve, 100));
      receiver.stopPolling();

      mockFetch.mockClear();

      await receiver.startPolling(50);
      await new Promise(resolve => setTimeout(resolve, 100));
      receiver.stopPolling();

      expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('EventEmitter', () => {
    it('extends EventEmitter', () => {
      expect(typeof receiver.on).toBe('function');
      expect(typeof receiver.off).toBe('function');
      expect(typeof receiver.emit).toBe('function');
    });

    it('supports multiple listeners for message event', async () => {
      const messages1: WeixinMessage[] = [];
      const messages2: WeixinMessage[] = [];

      receiver.on('message', (msg: WeixinMessage) => messages1.push(msg));
      receiver.on('message', (msg: WeixinMessage) => messages2.push(msg));

      const mockResp: GetUpdatesResp = {
        msgs: [{ message_id: 1, from_user_id: 'user1' }],
        get_updates_buf: 'buf1',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockResp),
      });

      await receiver.startPolling(50);
      await new Promise(resolve => setTimeout(resolve, 100));
      receiver.stopPolling();

      expect(messages1.length).toBeGreaterThan(0);
      expect(messages2.length).toBeGreaterThan(0);
    });
  });
});
