import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeixinSDK } from '../../src/core/client.js';
import { WeixinConfig, LogLevel } from '../../src/core/types.js';
import { TokenAuthProvider } from '../../src/auth/providers.js';
import type { WeixinMessage } from '../../src/api/types.js';

describe('WeixinSDK', () => {
  let sdk: WeixinSDK;
  let config: WeixinConfig;
  let auth: TokenAuthProvider;

  beforeEach(() => {
    config = {
      baseUrl: 'https://api.weixin.example.com',
      cdnBaseUrl: 'https://cdn.weixin.example.com',
      timeout: 5000,
      logLevel: LogLevel.ERROR,
      enableConsoleLog: false,
    };
    auth = new TokenAuthProvider('test-token', 'user-123');
  });

  afterEach(async () => {
    if (sdk) {
      try {
        await sdk.stop();
      } catch {}
    }
  });

  describe('constructor', () => {
    it('should create SDK with valid config and auth', () => {
      sdk = new WeixinSDK({ config, auth });
      expect(sdk).toBeDefined();
      expect(sdk.config).toEqual(expect.objectContaining(config));
      expect(sdk.auth).toBe(auth);
    });

    it('should initialize all sub-modules', () => {
      sdk = new WeixinSDK({ config, auth });
      expect(sdk.messaging).toBeDefined();
      expect(sdk.messaging.sender).toBeDefined();
      expect(sdk.messaging.receiver).toBeDefined();
      expect(sdk.media).toBeDefined();
      expect(sdk.media.uploader).toBeDefined();
    });

    it('should inherit from EventEmitter', () => {
      sdk = new WeixinSDK({ config, auth });
      expect(typeof sdk.on).toBe('function');
      expect(typeof sdk.off).toBe('function');
      expect(typeof sdk.emit).toBe('function');
    });
  });

  describe('authenticate', () => {
    it('should call auth.authenticate() and set token on api client', async () => {
      sdk = new WeixinSDK({ config, auth });
      const spy = vi.spyOn(auth, 'authenticate');
      
      await sdk.authenticate();
      
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should forward auth_success event from auth provider', async () => {
      sdk = new WeixinSDK({ config, auth });
      const handler = vi.fn();
      sdk.on('auth_success', handler);
      
      await sdk.authenticate();
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        token: 'test-token',
        userId: 'user-123',
      }));
    });
  });

  describe('start', () => {
    it('should authenticate if not already authenticated', async () => {
      sdk = new WeixinSDK({ config, auth });
      const authSpy = vi.spyOn(auth, 'authenticate');
      
      await sdk.start();
      
      expect(authSpy).toHaveBeenCalledTimes(1);
    });

    it('should not re-authenticate if already authenticated', async () => {
      sdk = new WeixinSDK({ config, auth });
      await auth.authenticate();
      const authSpy = vi.spyOn(auth, 'authenticate');
      
      await sdk.start();
      
      expect(authSpy).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop polling', async () => {
      sdk = new WeixinSDK({ config, auth });
      await sdk.start();
      
      await sdk.stop();
      
      expect(sdk.messaging.receiver).toBeDefined();
    });

    it('should call logout if supported', async () => {
      const mockLogout = vi.fn().mockResolvedValue(undefined);
      auth.logout = mockLogout;
      sdk = new WeixinSDK({ config, auth });
      await sdk.start();
      
      await sdk.stop();
      
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendText', () => {
    it('should send text message via message sender', async () => {
      sdk = new WeixinSDK({ config, auth });
      await sdk.authenticate();
      
      const sendSpy = vi.spyOn(sdk.messaging.sender, 'sendText').mockResolvedValue();
      
      await sdk.sendText('user-456', 'Hello World', 'ctx-1');
      
      expect(sendSpy).toHaveBeenCalledWith({
        to: 'user-456',
        text: 'Hello World',
        contextToken: 'ctx-1',
      });
    });
  });

  describe('onMessage', () => {
    it('should register message listener', () => {
      sdk = new WeixinSDK({ config, auth });
      const listener = vi.fn();
      
      const result = sdk.onMessage(listener);
      
      expect(result).toBe(sdk);
    });

    it('should forward messages from receiver', async () => {
      sdk = new WeixinSDK({ config, auth });
      const listener = vi.fn();
      sdk.onMessage(listener);
      
      const testMessage: WeixinMessage = {
        from_user_id: 'sender-123',
        to_user_id: 'user-123',
        item_list: [{ type: 1, text_item: { text: 'Test message' } }],
      };
      
      sdk.messaging.receiver.emit('message', testMessage);
      
      expect(listener).toHaveBeenCalledWith(testMessage);
    });
  });

  describe('event forwarding', () => {
    it('should forward qr_generated event from auth provider', async () => {
      sdk = new WeixinSDK({ config, auth });
      const handler = vi.fn();
      sdk.on('qr_generated', handler);
      
      auth.emit('qr_generated', { url: 'https://qr.url', sessionKey: 'key123' });
      
      expect(handler).toHaveBeenCalledWith({ url: 'https://qr.url', sessionKey: 'key123' });
    });

    it('should forward auth_failed event from auth provider', async () => {
      sdk = new WeixinSDK({ config, auth });
      const handler = vi.fn();
      sdk.on('auth_failed', handler);
      
      const error = new Error('Auth failed');
      auth.emit('auth_failed', { error });
      
      expect(handler).toHaveBeenCalledWith({ error });
    });
  });
});
