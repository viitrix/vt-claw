import { ApiEndpoints } from '../api/endpoints.js';
import { EventEmitter } from '../utils/event-emitter.js';
import type { WeixinMessage } from '../api/types.js';

export class MessageReceiver extends EventEmitter {
  private api: ApiEndpoints;
  private polling: boolean = false;
  private pollInterval: number = 30000;
  private getUpdatesBuf: string = '';
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(api: ApiEndpoints) {
    super();
    this.api = api;
  }

  async startPolling(intervalMs?: number): Promise<void> {
    if (intervalMs !== undefined) {
      this.pollInterval = intervalMs;
    }

    this.polling = true;
    this.poll();
  }

  stopPolling(): void {
    this.polling = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.polling) {
      return;
    }

    try {
      const response = await this.api.getUpdates({
        get_updates_buf: this.getUpdatesBuf,
      });

      if (response.get_updates_buf) {
        this.getUpdatesBuf = response.get_updates_buf;
      }

      if (response.errcode === -14) {
        this.getUpdatesBuf = '';
      }

      if (response.msgs && response.msgs.length > 0) {
        for (const msg of response.msgs) {
          this.emit('message', msg);
        }
      }

      if (response.longpolling_timeout_ms && response.longpolling_timeout_ms > 0) {
        this.pollInterval = response.longpolling_timeout_ms;
      }
    } catch (error) {
      this.emit('error', error);
    }

    if (this.polling) {
      this.timeoutId = setTimeout(() => {
        this.poll();
      }, this.pollInterval);
    }
  }
}
