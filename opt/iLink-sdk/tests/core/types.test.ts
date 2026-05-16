import { describe, it, expect } from 'vitest';
import { 
  WeixinConfig, 
  ResolvedWeixinAccount, 
  AccountConfig,
  AuthResult,
  LogLevel
} from '../../src/core/types.js';

describe('Core Types', () => {
  describe('WeixinConfig', () => {
    it('should define WeixinConfig with required fields', () => {
      const config: WeixinConfig = {
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com'
      };
      expect(config.baseUrl).toBe('https://api.weixin.com');
      expect(config.cdnBaseUrl).toBe('https://cdn.weixin.com');
    });

    it('should allow optional timeout and retries', () => {
      const config: WeixinConfig = {
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        timeout: 30000,
        retries: 3
      };
      expect(config.timeout).toBe(30000);
      expect(config.retries).toBe(3);
    });

    it('should allow optional auth configuration', () => {
      const config: WeixinConfig = {
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        autoRefreshToken: true,
        tokenRefreshThreshold: 60000
      };
      expect(config.autoRefreshToken).toBe(true);
      expect(config.tokenRefreshThreshold).toBe(60000);
    });

    it('should allow optional message configuration', () => {
      const config: WeixinConfig = {
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        messageChunkLimit: 4096,
        pollingInterval: 25000
      };
      expect(config.messageChunkLimit).toBe(4096);
      expect(config.pollingInterval).toBe(25000);
    });

    it('should allow optional log configuration', () => {
      const config: WeixinConfig = {
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        logLevel: LogLevel.DEBUG,
        enableConsoleLog: true
      };
      expect(config.logLevel).toBe(LogLevel.DEBUG);
      expect(config.enableConsoleLog).toBe(true);
    });

    it('should allow optional account configuration', () => {
      const accountConfig: AccountConfig = {
        accountId: 'test-account',
        enabled: true,
        configured: true
      };
      const config: WeixinConfig = {
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        account: accountConfig
      };
      expect(config.account?.accountId).toBe('test-account');
    });
  });

  describe('ResolvedWeixinAccount', () => {
    it('should define ResolvedWeixinAccount structure', () => {
      const account: ResolvedWeixinAccount = {
        accountId: 'test-id',
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        enabled: true,
        configured: true
      };
      expect(account.accountId).toBe('test-id');
      expect(account.baseUrl).toBe('https://api.weixin.com');
      expect(account.cdnBaseUrl).toBe('https://cdn.weixin.com');
      expect(account.enabled).toBe(true);
      expect(account.configured).toBe(true);
    });

    it('should allow optional token', () => {
      const account: ResolvedWeixinAccount = {
        accountId: 'test-id',
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        enabled: true,
        configured: true,
        token: 'test-token'
      };
      expect(account.token).toBe('test-token');
    });

    it('should allow optional name', () => {
      const account: ResolvedWeixinAccount = {
        accountId: 'test-id',
        baseUrl: 'https://api.weixin.com',
        cdnBaseUrl: 'https://cdn.weixin.com',
        enabled: true,
        configured: true,
        name: 'Test Account'
      };
      expect(account.name).toBe('Test Account');
    });
  });

  describe('AuthResult', () => {
    it('should define AuthResult with required fields', () => {
      const authResult: AuthResult = {
        token: 'test-token',
        userId: 'user-123',
        expiresAt: Date.now() + 3600000
      };
      expect(authResult.token).toBe('test-token');
      expect(authResult.userId).toBe('user-123');
      expect(authResult.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should allow optional refreshToken', () => {
      const authResult: AuthResult = {
        token: 'test-token',
        userId: 'user-123',
        expiresAt: Date.now() + 3600000,
        refreshToken: 'refresh-token'
      };
      expect(authResult.refreshToken).toBe('refresh-token');
    });

    it('should allow optional accountId and baseUrl', () => {
      const authResult: AuthResult = {
        token: 'test-token',
        userId: 'user-123',
        expiresAt: Date.now() + 3600000,
        accountId: 'account-123',
        baseUrl: 'https://custom.api.com'
      };
      expect(authResult.accountId).toBe('account-123');
      expect(authResult.baseUrl).toBe('https://custom.api.com');
    });
  });

  describe('LogLevel', () => {
    it('should have correct log level values', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
    });
  });
});
