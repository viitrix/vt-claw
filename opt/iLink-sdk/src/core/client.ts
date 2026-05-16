import { EventEmitter } from '../utils/event-emitter.js';
import { Logger } from '../utils/logger.js';
import { ApiClient } from '../api/client.js';
import { ApiEndpoints } from '../api/endpoints.js';
import { MessageSender } from '../messaging/sender.js';
import { MessageReceiver } from '../messaging/receiver.js';
import { MediaUploader } from '../media/uploader.js';
import { MediaDownloader } from '../media/downloader.js';
import type { WeixinConfig, AuthResult } from '../core/types.js';
import type { AuthProvider } from '../auth/interfaces.js';
import type { WeixinMessage } from '../api/types.js';
import { UploadMediaType } from '../api/types.js';
import { DEFAULT_BASE_URL, DEFAULT_CDN_BASE_URL } from './types.js';
import type { DownloadMediaOptions, DownloadedMedia } from '../media/downloader.js';

export interface WeixinSDKOptions {
  config: WeixinConfig;
  auth: AuthProvider;
}

export class WeixinSDK extends EventEmitter {
  public readonly config: WeixinConfig;
  public readonly auth: AuthProvider;
  public readonly messaging: { sender: MessageSender; receiver: MessageReceiver };
  public readonly media: { uploader: MediaUploader; downloader: MediaDownloader };

  private readonly apiClient: ApiClient;
  private readonly apiEndpoints: ApiEndpoints;
  private readonly logger: Logger;
  private started: boolean = false;

  constructor(options: WeixinSDKOptions) {
    super();
    this.config = {
      baseUrl: DEFAULT_BASE_URL,
      cdnBaseUrl: DEFAULT_CDN_BASE_URL,
      ...options.config,
    };
    this.auth = options.auth;

    this.logger = new Logger({
      level: this.config.logLevel,
      enableConsole: this.config.enableConsoleLog ?? true,
      prefix: '[WeixinSDK]',
    });

    this.apiClient = new ApiClient(this.config);
    this.apiEndpoints = new ApiEndpoints(this.apiClient);

    const uploader = new MediaUploader(this.apiEndpoints, this.config.cdnBaseUrl!);
    const downloader = new MediaDownloader(this.config.cdnBaseUrl!);
    const sender = new MessageSender(this.apiEndpoints, uploader);
    const receiver = new MessageReceiver(this.apiEndpoints);

    this.messaging = { sender, receiver };
    this.media = { uploader, downloader };

    this.forwardAuthEvents();
    this.forwardMessageEvents();
  }

  private forwardAuthEvents(): void {
    this.auth.on('qr_generated', (data) => {
      this.emit('qr_generated', data);
    });

    this.auth.on('auth_success', (data) => {
      this.emit('auth_success', data);
    });

    this.auth.on('auth_failed', (data) => {
      this.emit('auth_failed', data);
    });
  }

  private forwardMessageEvents(): void {
    this.messaging.receiver.on('message', (msg) => {
      this.emit('message', msg);
    });

    this.messaging.receiver.on('error', (error) => {
      this.emit('error', error);
    });
  }

  async authenticate(): Promise<void> {
    this.logger.info('Authenticating...');
    const result = await this.auth.authenticate();
    this.apiClient.setAuthToken(result.token);
    this.logger.info('Authentication successful');
  }

  async start(): Promise<void> {
    this.logger.info('Starting SDK...');

    if (!this.auth.isAuthenticated()) {
      await this.authenticate();
    } else {
      const currentAuth = this.auth.getCurrentAuth?.();
      if (currentAuth) {
        this.apiClient.setAuthToken(currentAuth.token);
      }
    }

    const pollingInterval = this.config.pollingInterval ?? 30000;
    this.started = true;
    await this.messaging.receiver.startPolling(pollingInterval);
    this.logger.info('SDK started');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;

    this.logger.info('Stopping SDK...');

    this.messaging.receiver.stopPolling();

    if (this.auth.logout) {
      try {
        await this.auth.logout();
        this.logger.info('Logged out');
      } catch (error) {
        this.logger.warn('Logout failed', error);
      }
    }

    this.auth.removeAllListeners();
    this.messaging.receiver.removeAllListeners();
    this.removeAllListeners();

    this.logger.info('SDK stopped');
  }

  async sendText(to: string, text: string, contextToken?: string): Promise<void> {
    await this.messaging.sender.sendText({ to, text, contextToken });
  }

  private static readonly MEDIA_TYPE_MAP: Record<string, number> = {
    image: UploadMediaType.IMAGE,
    video: UploadMediaType.VIDEO,
    file: UploadMediaType.FILE,
    voice: UploadMediaType.VOICE,
  };

  async sendMedia(
    to: string,
    filePath: string,
    mediaType: 'image' | 'video' | 'file' | 'voice',
    options?: { text?: string; fileName?: string; contextToken?: string },
  ): Promise<void> {
    const type = WeixinSDK.MEDIA_TYPE_MAP[mediaType];
    await this.messaging.sender.sendMedia({ to, filePath, mediaType: type, text: options?.text, fileName: options?.fileName, contextToken: options?.contextToken });
  }

  async sendImage(to: string, filePath: string, options?: { text?: string; contextToken?: string }): Promise<void> {
    await this.sendMedia(to, filePath, 'image', options);
  }

  async sendVideo(to: string, filePath: string, options?: { text?: string; contextToken?: string }): Promise<void> {
    await this.sendMedia(to, filePath, 'video', options);
  }

  async sendFile(to: string, filePath: string, options?: { fileName?: string; contextToken?: string }): Promise<void> {
    await this.sendMedia(to, filePath, 'file', options);
  }

  async sendVoice(to: string, filePath: string, options?: { contextToken?: string }): Promise<void> {
    await this.sendMedia(to, filePath, 'voice', options);
  }

  async downloadMedia(message: WeixinMessage, options?: DownloadMediaOptions): Promise<DownloadedMedia | null> {
    return this.media.downloader.downloadFirstMedia(message, options);
  }

  onMessage(listener: (message: WeixinMessage) => void): this {
    this.on('message', listener as (...args: unknown[]) => void);
    return this;
  }
}
