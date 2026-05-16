import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/utils/logger.js';
import { LogLevel } from '../../src/core/types.js';

describe('Logger', () => {
  let consoleSpies: {
    log: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpies = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    Object.values(consoleSpies).forEach(spy => spy.mockRestore());
  });

  describe('constructor', () => {
    it('should create logger with default options', () => {
      const logger = new Logger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should accept level option', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      logger.debug('test');
      expect(consoleSpies.log).not.toHaveBeenCalled();
    });

    it('should accept prefix option', () => {
      const logger = new Logger({ prefix: '[WeixinSDK]', level: LogLevel.DEBUG });
      logger.debug('test message');
      expect(consoleSpies.log).toHaveBeenCalled();
      const call = consoleSpies.log.mock.calls[0][0];
      expect(call).toContain('[WeixinSDK]');
      expect(call).toContain('[DEBUG]');
      expect(call).toContain('test message');
    });

    it('should accept enableConsole option', () => {
      const logger = new Logger({ enableConsole: false, level: LogLevel.DEBUG });
      logger.debug('test');
      logger.info('test');
      logger.warn('test');
      logger.error('test');
      expect(consoleSpies.log).not.toHaveBeenCalled();
      expect(consoleSpies.info).not.toHaveBeenCalled();
      expect(consoleSpies.warn).not.toHaveBeenCalled();
      expect(consoleSpies.error).not.toHaveBeenCalled();
    });
  });

  describe('level filtering', () => {
    it('should log DEBUG when level is DEBUG', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      logger.debug('test');
      expect(consoleSpies.log).toHaveBeenCalled();
    });

    it('should not log DEBUG when level is INFO', () => {
      const logger = new Logger({ level: LogLevel.INFO });
      logger.debug('test');
      expect(consoleSpies.log).not.toHaveBeenCalled();
    });

    it('should log INFO when level is INFO', () => {
      const logger = new Logger({ level: LogLevel.INFO });
      logger.info('test');
      expect(consoleSpies.info).toHaveBeenCalled();
    });

    it('should not log INFO when level is WARN', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      logger.info('test');
      expect(consoleSpies.info).not.toHaveBeenCalled();
    });

    it('should log WARN when level is WARN', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      logger.warn('test');
      expect(consoleSpies.warn).toHaveBeenCalled();
    });

    it('should not log WARN when level is ERROR', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      logger.warn('test');
      expect(consoleSpies.warn).not.toHaveBeenCalled();
    });

    it('should always log ERROR when level is ERROR', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      logger.error('test');
      expect(consoleSpies.error).toHaveBeenCalled();
    });
  });

  describe('log format', () => {
    it('should include timestamp in format', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      logger.debug('test');
      const call = consoleSpies.log.mock.calls[0][0];
      expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include level name in format', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      logger.info('test');
      const call = consoleSpies.info.mock.calls[0][0];
      expect(call).toContain('[INFO]');
    });

    it('should pass additional arguments to console', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      const extraData = { key: 'value' };
      logger.debug('test', extraData, 'extra');
      expect(consoleSpies.log).toHaveBeenCalledWith(
        expect.any(String),
        extraData,
        'extra'
      );
    });
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      logger.debug('before');
      expect(consoleSpies.log).not.toHaveBeenCalled();
      
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('after');
      expect(consoleSpies.log).toHaveBeenCalled();
    });
  });

  describe('child', () => {
    it('should create child logger with inherited options', () => {
      const parent = new Logger({ level: LogLevel.WARN, prefix: '[Parent]' });
      const child = parent.child({ prefix: '[Child]' });
      
      child.warn('test');
      expect(consoleSpies.warn).toHaveBeenCalled();
      const call = consoleSpies.warn.mock.calls[0][0];
      expect(call).toContain('[Child]');
    });

    it('should allow child to override level', () => {
      const parent = new Logger({ level: LogLevel.ERROR });
      const child = parent.child({ level: LogLevel.DEBUG });
      
      child.debug('test');
      expect(consoleSpies.log).toHaveBeenCalled();
    });

    it('should inherit parent level if not specified', () => {
      const parent = new Logger({ level: LogLevel.WARN });
      const child = parent.child({ prefix: '[Child]' });
      
      child.info('should not log');
      expect(consoleSpies.info).not.toHaveBeenCalled();
      
      child.warn('should log');
      expect(consoleSpies.warn).toHaveBeenCalled();
    });
  });

  describe('default values', () => {
    it('should default level to INFO', () => {
      const logger = new Logger();
      logger.debug('should not log');
      expect(consoleSpies.log).not.toHaveBeenCalled();
      
      logger.info('should log');
      expect(consoleSpies.info).toHaveBeenCalled();
    });

    it('should default enableConsole to true', () => {
      const logger = new Logger();
      logger.info('test');
      expect(consoleSpies.info).toHaveBeenCalled();
    });
  });
});
