type EventHandler = (...args: unknown[]) => void;

export class EventEmitter {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
    return this;
  }

  off(event: string, handler: EventHandler): this {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  once(event: string, handler: EventHandler): this {
    const onceHandler: EventHandler = (...args) => {
      this.off(event, onceHandler);
      handler(...args);
    };
    return this.on(event, onceHandler);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.length === 0) {
      return false;
    }
    handlers.forEach(handler => handler(...args));
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event !== undefined) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
    return this;
  }
}
