import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenAuthProvider } from '../../src/auth/providers.js';

describe('TokenAuthProvider', () => {
  let provider: TokenAuthProvider;

  beforeEach(() => {
    provider = new TokenAuthProvider('test-token', 'user-123');
  });

  describe('constructor', () => {
    it('should create provider with token and optional userId', () => {
      const providerWithUser = new TokenAuthProvider('test-token', 'user-123');
      expect(providerWithUser).toBeDefined();
      
      const providerWithoutUser = new TokenAuthProvider('test-token');
      expect(providerWithoutUser).toBeDefined();
    });
  });

  describe('authenticate', () => {
    it('should return AuthResult with 1-year expiry', async () => {
      const result = await provider.authenticate();
      
      expect(result.token).toBe('test-token');
      expect(result.userId).toBe('user-123');
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      
      const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
      const oneYearAgo = Date.now() + 364 * 24 * 60 * 60 * 1000;
      expect(result.expiresAt).toBeLessThanOrEqual(oneYearFromNow);
      expect(result.expiresAt).toBeGreaterThanOrEqual(oneYearAgo);
    });

    it('should emit auth_success event on successful authentication', async () => {
      const handler = vi.fn();
      provider.on('auth_success', handler);
      
      await provider.authenticate();
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        token: 'test-token',
        userId: 'user-123',
      }));
    });
  });

  describe('isAuthenticated', () => {
    it('should return false before authentication', () => {
      const newProvider = new TokenAuthProvider('test-token');
      expect(newProvider.isAuthenticated()).toBe(false);
    });

    it('should return true after successful authentication', async () => {
      await provider.authenticate();
      expect(provider.isAuthenticated()).toBe(true);
    });
  });

  describe('getCurrentAuth', () => {
    it('should return null before authentication', () => {
      const newProvider = new TokenAuthProvider('test-token');
      expect(newProvider.getCurrentAuth()).toBeNull();
    });

    it('should return AuthResult after authentication', async () => {
      await provider.authenticate();
      const auth = provider.getCurrentAuth();
      
      expect(auth).not.toBeNull();
      expect(auth?.token).toBe('test-token');
      expect(auth?.userId).toBe('user-123');
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
