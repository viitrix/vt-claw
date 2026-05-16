import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../../src/utils/event-emitter.js';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on', () => {
    it('should register event handler', () => {
      const handler = vi.fn();
      emitter.on('test', handler);
      emitter.emit('test', 'data');
      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.emit('test', 'data');
      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
    });

    it('should return this for chaining', () => {
      const handler = vi.fn();
      const result = emitter.on('test', handler);
      expect(result).toBe(emitter);
    });
  });

  describe('off', () => {
    it('should remove registered handler', () => {
      const handler = vi.fn();
      emitter.on('test', handler);
      emitter.off('test', handler);
      emitter.emit('test', 'data');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove specified handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.off('test', handler1);
      emitter.emit('test', 'data');
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith('data');
    });

    it('should return this for chaining', () => {
      const handler = vi.fn();
      emitter.on('test', handler);
      const result = emitter.off('test', handler);
      expect(result).toBe(emitter);
    });

    it('should handle removing non-existent handler gracefully', () => {
      const handler = vi.fn();
      expect(() => emitter.off('test', handler)).not.toThrow();
    });
  });

  describe('once', () => {
    it('should register handler that fires only once', () => {
      const handler = vi.fn();
      emitter.once('test', handler);
      emitter.emit('test', 'data1');
      emitter.emit('test', 'data2');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('data1');
    });

    it('should return this for chaining', () => {
      const handler = vi.fn();
      const result = emitter.once('test', handler);
      expect(result).toBe(emitter);
    });
  });

  describe('emit', () => {
    it('should call handlers with multiple arguments', () => {
      const handler = vi.fn();
      emitter.on('test', handler);
      emitter.emit('test', 'arg1', 'arg2', 'arg3');
      expect(handler).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
    });

    it('should return true when handlers were called', () => {
      const handler = vi.fn();
      emitter.on('test', handler);
      const result = emitter.emit('test', 'data');
      expect(result).toBe(true);
    });

    it('should return false when no handlers exist', () => {
      const result = emitter.emit('nonexistent', 'data');
      expect(result).toBe(false);
    });

    it('should handle events with no arguments', () => {
      const handler = vi.fn();
      emitter.on('test', handler);
      emitter.emit('test');
      expect(handler).toHaveBeenCalledWith();
    });
  });

  describe('chaining', () => {
    it('should support method chaining for on/off/once', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      emitter
        .on('event1', handler1)
        .on('event2', handler2);
      
      emitter.emit('event1', 'data1');
      emitter.emit('event2', 'data2');
      
      expect(handler1).toHaveBeenCalledWith('data1');
      expect(handler2).toHaveBeenCalledWith('data2');
    });
  });
});
