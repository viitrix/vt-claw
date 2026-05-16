import { describe, it, expect } from 'vitest';
import { WeixinSDKError, ErrorCode } from '../../src/core/errors.js';

describe('Error Handling', () => {
  describe('ErrorCode', () => {
    it('should have auth error codes in 1000-1999 range', () => {
      expect(ErrorCode.AUTH_REQUIRED).toBeGreaterThanOrEqual(1000);
      expect(ErrorCode.AUTH_REQUIRED).toBeLessThanOrEqual(1999);
      expect(ErrorCode.AUTH_FAILED).toBeGreaterThanOrEqual(1000);
      expect(ErrorCode.AUTH_FAILED).toBeLessThanOrEqual(1999);
      expect(ErrorCode.TOKEN_EXPIRED).toBeGreaterThanOrEqual(1000);
      expect(ErrorCode.TOKEN_EXPIRED).toBeLessThanOrEqual(1999);
    });

    it('should have network error codes in 2000-2999 range', () => {
      expect(ErrorCode.NETWORK_ERROR).toBeGreaterThanOrEqual(2000);
      expect(ErrorCode.NETWORK_ERROR).toBeLessThanOrEqual(2999);
      expect(ErrorCode.TIMEOUT).toBeGreaterThanOrEqual(2000);
      expect(ErrorCode.TIMEOUT).toBeLessThanOrEqual(2999);
      expect(ErrorCode.RATE_LIMIT).toBeGreaterThanOrEqual(2000);
      expect(ErrorCode.RATE_LIMIT).toBeLessThanOrEqual(2999);
    });

    it('should have API error codes in 3000-3999 range', () => {
      expect(ErrorCode.API_ERROR).toBeGreaterThanOrEqual(3000);
      expect(ErrorCode.API_ERROR).toBeLessThanOrEqual(3999);
      expect(ErrorCode.INVALID_RESPONSE).toBeGreaterThanOrEqual(3000);
      expect(ErrorCode.INVALID_RESPONSE).toBeLessThanOrEqual(3999);
      expect(ErrorCode.SERVER_ERROR).toBeGreaterThanOrEqual(3000);
      expect(ErrorCode.SERVER_ERROR).toBeLessThanOrEqual(3999);
    });

    it('should have message error codes in 4000-4999 range', () => {
      expect(ErrorCode.MESSAGE_INVALID).toBeGreaterThanOrEqual(4000);
      expect(ErrorCode.MESSAGE_INVALID).toBeLessThanOrEqual(4999);
      expect(ErrorCode.MESSAGE_TOO_LARGE).toBeGreaterThanOrEqual(4000);
      expect(ErrorCode.MESSAGE_TOO_LARGE).toBeLessThanOrEqual(4999);
      expect(ErrorCode.MEDIA_UPLOAD_FAILED).toBeGreaterThanOrEqual(4000);
      expect(ErrorCode.MEDIA_UPLOAD_FAILED).toBeLessThanOrEqual(4999);
    });

    it('should have config error codes in 5000-5999 range', () => {
      expect(ErrorCode.INVALID_CONFIG).toBeGreaterThanOrEqual(5000);
      expect(ErrorCode.INVALID_CONFIG).toBeLessThanOrEqual(5999);
      expect(ErrorCode.MISSING_REQUIRED).toBeGreaterThanOrEqual(5000);
      expect(ErrorCode.MISSING_REQUIRED).toBeLessThanOrEqual(5999);
    });
  });

  describe('WeixinSDKError', () => {
    it('should create WeixinSDKError with code and message', () => {
      const error = new WeixinSDKError(
        ErrorCode.AUTH_FAILED,
        'Authentication failed'
      );
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('WeixinSDKError');
      expect(error.code).toBe(ErrorCode.AUTH_FAILED);
      expect(error.message).toContain('Authentication failed');
    });

    it('should include error code name in message', () => {
      const error = new WeixinSDKError(
        ErrorCode.NETWORK_ERROR,
        'Network timeout'
      );
      expect(error.message).toContain('NETWORK_ERROR');
    });

    it('should include details in error', () => {
      const error = new WeixinSDKError(
        ErrorCode.NETWORK_ERROR,
        'Network timeout',
        { timeout: 30000, url: 'https://api.test.com' }
      );
      expect(error.details).toEqual({ timeout: 30000, url: 'https://api.test.com' });
    });

    it('should work without details', () => {
      const error = new WeixinSDKError(
        ErrorCode.INVALID_CONFIG,
        'Missing required config'
      );
      expect(error.details).toBeUndefined();
    });

    it('should have proper stack trace', () => {
      const error = new WeixinSDKError(
        ErrorCode.API_ERROR,
        'API call failed'
      );
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('WeixinSDKError');
    });

    it('should be catchable as Error', () => {
      const throwError = () => {
        throw new WeixinSDKError(ErrorCode.AUTH_FAILED, 'Auth failed');
      };

      try {
        throwError();
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(WeixinSDKError);
      }
    });

    it('should support JSON serialization', () => {
      const error = new WeixinSDKError(
        ErrorCode.NETWORK_ERROR,
        'Connection failed',
        { attempt: 3, maxRetries: 5 }
      );
      
      const serialized = JSON.stringify({
        name: error.name,
        code: error.code,
        message: error.message,
        details: error.details
      });

      const parsed = JSON.parse(serialized);
      expect(parsed.name).toBe('WeixinSDKError');
      expect(parsed.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(parsed.details.attempt).toBe(3);
    });
  });
});
