import type { AuthResult } from '../core/types.js';
import { EventEmitter } from '../utils/event-emitter.js';
import type { AuthProvider, QrAuthEvents, QrCodeResponse, QrCodeStatusResponse } from './interfaces.js';
import { ApiClient } from '../api/client.js';
import type { WeixinConfig } from '../core/types.js';

const POLL_INTERVAL = 2000;
const TIMEOUT = 480000;
const DEFAULT_BOT_TYPE = '3';

export class QrAuthProvider extends EventEmitter implements AuthProvider {
  private apiClient: ApiClient;
  private defaultBotType?: string;
  private authResult: AuthResult | null = null;

  constructor(apiClient: ApiClient, defaultBotType?: string) {
    super();
    this.apiClient = apiClient;
    this.defaultBotType = defaultBotType ?? DEFAULT_BOT_TYPE;
  }

  /**
   * Create a QrAuthProvider from a config object.
   * This is the recommended way to create a QrAuthProvider —
   * you don't need to manually create an ApiClient.
   */
  static fromConfig(config: WeixinConfig, defaultBotType?: string): QrAuthProvider {
    return new QrAuthProvider(new ApiClient(config), defaultBotType);
  }

  async authenticate(): Promise<AuthResult> {
    const botType = this.defaultBotType ?? DEFAULT_BOT_TYPE;
    const qrResponse = await this.apiClient.request<QrCodeResponse>({
      method: 'GET',
      path: `/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
    });

    const qrcode = qrResponse.data.qrcode ?? qrResponse.data.sessionKey;
    const qrUrl = qrResponse.data.qrcode_img_content ?? qrResponse.data.qrUrl;
    const sessionKey = qrcode ?? qrResponse.data.sessionKey ?? '';

    if (!qrUrl || !sessionKey) {
      const error = new Error('QR code response missing qrcode or qrcode_img_content');
      this.emit('auth_failed', { error });
      throw error;
    }

    this.emit('qr_generated', { url: qrUrl, sessionKey });

    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime >= TIMEOUT) {
        const error = new Error('QR code authentication timeout');
        this.emit('auth_failed', { error });
        throw error;
      }

      const statusResponse = await this.apiClient.request<QrCodeStatusResponse>({
        method: 'GET',
        path: `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(sessionKey)}`,
        headers: {
          'iLink-App-ClientVersion': '1',
        },
      });

      const { status } = statusResponse.data;

      if (status === 'confirmed') {
        const result: AuthResult = {
          token: statusResponse.data.bot_token ?? statusResponse.data.token ?? '',
          userId: statusResponse.data.ilink_user_id ?? statusResponse.data.userId ?? '',
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
          accountId: statusResponse.data.ilink_bot_id ?? statusResponse.data.accountId,
          baseUrl: statusResponse.data.baseUrl ?? statusResponse.data.baseurl,
        };

        this.authResult = result;
        this.emit('auth_success', result);

        return result;
      }

      if (status === 'error' || status === 'expired' || status === 'cancelled') {
        const error = new Error(statusResponse.data.message ?? `Authentication ${status}`);
        this.emit('auth_failed', { error });
        throw error;
      }

      if (status === 'scanned' || status === 'scaned') {
        this.emit('qr_scanned', { status });
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  isAuthenticated(): boolean {
    return this.authResult !== null;
  }

  getCurrentAuth(): AuthResult | null {
    return this.authResult;
  }

}

export type { QrAuthEvents };
