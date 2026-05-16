import type { AuthResult } from '../core/types.js';
import { EventEmitter } from '../utils/event-emitter.js';
import type { AuthProvider } from './interfaces.js';

export class TokenAuthProvider extends EventEmitter implements AuthProvider {
  private token: string;
  private userId?: string;
  private authResult: AuthResult | null = null;

  constructor(token: string, userId?: string) {
    super();
    this.token = token;
    this.userId = userId;
  }

  async authenticate(): Promise<AuthResult> {
    const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
    
    this.authResult = {
      token: this.token,
      userId: this.userId ?? '',
      expiresAt,
    };

    this.emit('auth_success', this.authResult);

    return this.authResult;
  }

  isAuthenticated(): boolean {
    return this.authResult !== null;
  }

  getCurrentAuth(): AuthResult | null {
    return this.authResult;
  }
}
