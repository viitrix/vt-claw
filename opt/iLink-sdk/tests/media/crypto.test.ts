import { describe, it, expect } from 'vitest';
import { aesEncrypt, aesDecrypt, md5, generateAesKey } from '../../src/media/crypto.js';

describe('crypto', () => {
  describe('generateAesKey', () => {
    it('generates a 32-character key', () => {
      const key = generateAesKey();
      expect(key.length).toBe(32);
    });

    it('generates different keys on each call', () => {
      const key1 = generateAesKey();
      const key2 = generateAesKey();
      expect(key1).not.toBe(key2);
    });

    it('generates keys with valid hexadecimal characters', () => {
      const key = generateAesKey();
      expect(key).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('aesEncrypt and aesDecrypt', () => {
    it('encrypts and decrypts data correctly', () => {
      const plaintext = Buffer.from('Hello, World!');
      const key = '00112233445566778899aabbccddeeff';

      const encrypted = aesEncrypt(plaintext, key);
      const decrypted = aesDecrypt(encrypted, key);

      expect(decrypted.toString()).toBe('Hello, World!');
    });

    it('produces different output than input', () => {
      const plaintext = Buffer.from('Test data');
      const key = '00112233445566778899aabbccddeeff';

      const encrypted = aesEncrypt(plaintext, key);

      expect(encrypted.toString('hex')).not.toBe(plaintext.toString('hex'));
    });

    it('encrypts empty data', () => {
      const plaintext = Buffer.from('');
      const key = '00112233445566778899aabbccddeeff';

      const encrypted = aesEncrypt(plaintext, key);
      const decrypted = aesDecrypt(encrypted, key);

      expect(decrypted.toString()).toBe('');
    });

    it('encrypts data longer than block size', () => {
      const plaintext = Buffer.from('This is a longer message that spans multiple AES blocks');
      const key = '00112233445566778899aabbccddeeff';

      const encrypted = aesEncrypt(plaintext, key);
      const decrypted = aesDecrypt(encrypted, key);

      expect(decrypted.toString()).toBe('This is a longer message that spans multiple AES blocks');
    });

    it('uses AES-128-ECB (16-byte key)', () => {
      const plaintext = Buffer.from('test');
      const key = '00112233445566778899aabbccddeeff';

      const encrypted = aesEncrypt(plaintext, key);

      expect(encrypted.length % 16).toBe(0);
    });
  });

  describe('md5', () => {
    it('calculates MD5 hash of a string', () => {
      const hash = md5('hello');
      expect(hash).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('calculates MD5 hash of a buffer', () => {
      const hash = md5(Buffer.from('hello'));
      expect(hash).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('calculates MD5 hash of empty data', () => {
      const hash = md5('');
      expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e');
    });

    it('produces consistent results', () => {
      const data = 'consistent data';
      const hash1 = md5(data);
      const hash2 = md5(data);
      expect(hash1).toBe(hash2);
    });

    it('produces 32-character hex string', () => {
      const hash = md5('test');
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });
  });
});
