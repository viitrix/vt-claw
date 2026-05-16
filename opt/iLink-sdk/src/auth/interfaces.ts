import type { AuthResult } from '../core/types.js';
import { EventEmitter } from '../utils/event-emitter.js';

export interface AuthProvider extends EventEmitter {
  authenticate(): Promise<AuthResult>;
  refreshToken?(): Promise<AuthResult>;
  logout?(): Promise<void>;
  isAuthenticated(): boolean;
  getCurrentAuth?(): AuthResult | null;
}

export interface QrAuthEvents {
  'qr_generated': { url: string; sessionKey: string };
  'qr_scanned': { status: string };
  'auth_success': AuthResult;
  'auth_failed': { error: Error };
}

export interface QrCodeResponse {
  qrUrl: string;
  sessionKey: string;
  qrcode?: string;
  qrcode_img_content?: string;
}

export interface QrCodeStatusResponse {
  status: string;
  token?: string;
  userId?: string;
  accountId?: string;
  baseUrl?: string;
  baseurl?: string;
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  message?: string;
}
