import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QrAuthProvider } from '../../src/auth/qr-auth.js';
import type { ApiClient } from '../../src/api/client.js';

const mockApiClient = (): ApiClient => {
  return {
    request: vi.fn(),
    setAuthToken: vi.fn(),
  } as unknown as ApiClient;
};

describe('QrAuthProvider', () => {
  let provider: QrAuthProvider;
  let apiClient: ApiClient;

  beforeEach(() => {
    apiClient = mockApiClient();
    provider = new QrAuthProvider(apiClient, 'default-bot');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with apiClient', () => {
      expect(provider).toBeDefined();
    });

    it('should accept optional defaultBotType', () => {
      const providerWithBot = new QrAuthProvider(apiClient, 'my-bot');
      expect(providerWithBot).toBeDefined();
    });
  });

  describe('authenticate', () => {
    it('should call get_bot_qrcode and emit qr_generated event', async () => {
      const qrHandler = vi.fn();
      provider.on('qr_generated', qrHandler);

      vi.mocked(apiClient.request).mockResolvedValueOnce({
        data: {
          qrcode: 'session-123',
          qrcode_img_content: 'https://example.com/qr',
        },
        status: 200,
        headers: new Headers(),
      });

      vi.mocked(apiClient.request).mockImplementation(async () => {
        await vi.advanceTimersByTimeAsync(100);
        return {
          data: { status: 'waiting' },
          status: 200,
          headers: new Headers(),
        };
      });

      const authPromise = provider.authenticate();
      await vi.advanceTimersByTimeAsync(100);

      expect(qrHandler).toHaveBeenCalledWith({
        url: 'https://example.com/qr',
        sessionKey: 'session-123',
      });

      vi.useRealTimers();
      try {
        await Promise.race([
          authPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100)),
        ]);
      } catch {
        // Expected to timeout or fail since we're not completing the flow
      }
      vi.useFakeTimers();
    });

    it('should poll get_qrcode_status and emit qr_scanned events', async () => {
      const scannedHandler = vi.fn();
      provider.on('qr_scanned', scannedHandler);

      vi.mocked(apiClient.request).mockResolvedValueOnce({
        data: {
          qrcode: 'session-123',
          qrcode_img_content: 'https://example.com/qr',
        },
        status: 200,
        headers: new Headers(),
      });

      let pollCount = 0;
      vi.mocked(apiClient.request).mockImplementation(async () => {
        pollCount++;
        if (pollCount === 1) {
          return {
            data: { status: 'waiting' },
            status: 200,
            headers: new Headers(),
          };
        }
        return {
          data: { status: 'scaned' },
          status: 200,
          headers: new Headers(),
        };
      });

      const authPromise = provider.authenticate();
      
      await vi.advanceTimersByTimeAsync(2500);

      expect(scannedHandler).toHaveBeenCalled();

      vi.useRealTimers();
      try {
        await Promise.race([
          authPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100)),
        ]);
      } catch {
        // Expected
      }
      vi.useFakeTimers();
    });

    it('should emit auth_success on confirmed status', async () => {
      const successHandler = vi.fn();
      provider.on('auth_success', successHandler);

      vi.mocked(apiClient.request).mockResolvedValueOnce({
        data: {
          qrcode: 'session-123',
          qrcode_img_content: 'https://example.com/qr',
        },
        status: 200,
        headers: new Headers(),
      });

      let pollCount = 0;
      vi.mocked(apiClient.request).mockImplementation(async () => {
        pollCount++;
        if (pollCount === 1) {
          return {
            data: { status: 'waiting' },
            status: 200,
            headers: new Headers(),
          };
        }
        return {
          data: {
            status: 'confirmed',
            bot_token: 'auth-token-123',
            ilink_user_id: 'user-456',
            ilink_bot_id: 'account-789',
            baseurl: 'https://api.example.com',
          },
          status: 200,
          headers: new Headers(),
        };
      });

      const authPromise = provider.authenticate();
      
      await vi.advanceTimersByTimeAsync(3000);

      vi.useRealTimers();
      const result = await authPromise;

      expect(result.token).toBe('auth-token-123');
      expect(result.userId).toBe('user-456');
      expect(successHandler).toHaveBeenCalledWith(expect.objectContaining({
        token: 'auth-token-123',
        userId: 'user-456',
      }));
      vi.useFakeTimers();
    });

    it('should emit auth_failed on error status', async () => {
      const failedHandler = vi.fn();
      provider.on('auth_failed', failedHandler);

      vi.mocked(apiClient.request).mockResolvedValueOnce({
        data: {
          qrcode: 'session-123',
          qrcode_img_content: 'https://example.com/qr',
        },
        status: 200,
        headers: new Headers(),
      });

      let pollCount = 0;
      vi.mocked(apiClient.request).mockImplementation(async () => {
        pollCount++;
        if (pollCount === 1) {
          return {
            data: { status: 'waiting' },
            status: 200,
            headers: new Headers(),
          };
        }
        return {
          data: { status: 'error', message: 'Authentication failed' },
          status: 200,
          headers: new Headers(),
        };
      });

      const authPromise = provider.authenticate();
      authPromise.catch(() => {});
      
      await vi.advanceTimersByTimeAsync(3000);

      vi.useRealTimers();
      await expect(authPromise).rejects.toThrow();
      expect(failedHandler).toHaveBeenCalled();
      vi.useFakeTimers();
    });

    it('should timeout after 480000ms (8 minutes)', async () => {
      vi.mocked(apiClient.request).mockResolvedValue({
        data: { status: 'waiting' },
        status: 200,
        headers: new Headers(),
      });

      vi.mocked(apiClient.request).mockResolvedValueOnce({
        data: {
          qrcode: 'session-123',
          qrcode_img_content: 'https://example.com/qr',
        },
        status: 200,
        headers: new Headers(),
      });

      const failedHandler = vi.fn();
      provider.on('auth_failed', failedHandler);

      const authPromise = provider.authenticate();
      authPromise.catch(() => {});
      
      await vi.advanceTimersByTimeAsync(480000);

      vi.useRealTimers();
      await expect(authPromise).rejects.toThrow('timeout');
      expect(failedHandler).toHaveBeenCalled();
      vi.useFakeTimers();
    }, 10000);
  });

  describe('isAuthenticated', () => {
    it('should return false before authentication', () => {
      expect(provider.isAuthenticated()).toBe(false);
    });

    it('should return true after successful authentication', async () => {
      vi.mocked(apiClient.request).mockResolvedValueOnce({
        data: {
          qrUrl: 'https://example.com/qr',
          sessionKey: 'session-123',
        },
        status: 200,
        headers: new Headers(),
      });

      vi.mocked(apiClient.request).mockResolvedValue({
        data: {
          status: 'confirmed',
          token: 'auth-token',
          userId: 'user-123',
        },
        status: 200,
        headers: new Headers(),
      });

      const authPromise = provider.authenticate();
      await vi.advanceTimersByTimeAsync(3000);

      vi.useRealTimers();
      await authPromise;
      expect(provider.isAuthenticated()).toBe(true);
      vi.useFakeTimers();
    });
  });

  describe('getCurrentAuth', () => {
    it('should return null before authentication', () => {
      expect(provider.getCurrentAuth()).toBeNull();
    });

    it('should return AuthResult after successful authentication', async () => {
      vi.mocked(apiClient.request).mockResolvedValueOnce({
        data: {
          qrUrl: 'https://example.com/qr',
          sessionKey: 'session-123',
        },
        status: 200,
        headers: new Headers(),
      });

      vi.mocked(apiClient.request).mockResolvedValue({
        data: {
          status: 'confirmed',
          token: 'auth-token',
          userId: 'user-123',
          accountId: 'account-456',
        },
        status: 200,
        headers: new Headers(),
      });

      const authPromise = provider.authenticate();
      await vi.advanceTimersByTimeAsync(3000);

      vi.useRealTimers();
      await authPromise;
      const auth = provider.getCurrentAuth();
      
      expect(auth).not.toBeNull();
      expect(auth?.token).toBe('auth-token');
      expect(auth?.userId).toBe('user-123');
      expect(auth?.accountId).toBe('account-456');
      vi.useFakeTimers();
    });
  });

  describe('EventEmitter integration', () => {
    it('should inherit from EventEmitter', () => {
      expect(typeof provider.on).toBe('function');
      expect(typeof provider.off).toBe('function');
      expect(typeof provider.emit).toBe('function');
      expect(typeof provider.once).toBe('function');
    });
  });
});
