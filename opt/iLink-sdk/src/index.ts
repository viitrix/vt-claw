export { WeixinSDK, type WeixinSDKOptions } from './core/client.js';
export { type WeixinConfig, type ResolvedWeixinAccount, type AuthResult, LogLevel, type AccountConfig, DEFAULT_BASE_URL, DEFAULT_CDN_BASE_URL } from './core/types.js';
export { WeixinSDKError, ErrorCode } from './core/errors.js';

export { type AuthProvider, type QrAuthEvents, type QrCodeResponse, type QrCodeStatusResponse } from './auth/interfaces.js';
export { FileTokenStore, type TokenStoreData } from './auth/token-store.js';
export { TokenAuthProvider } from './auth/providers.js';
export { QrAuthProvider } from './auth/qr-auth.js';

export { ApiClient, type ApiRequestOptions, type ApiResponse } from './api/client.js';
export { ApiEndpoints } from './api/endpoints.js';
export * from './api/types.js';

export { MessageSender, type SendTextOptions, type SendMediaOptions } from './messaging/sender.js';
export { MessageReceiver } from './messaging/receiver.js';

export { MediaUploader } from './media/uploader.js';
export { MediaDownloader, type DownloadMediaOptions, type DownloadedMedia } from './media/downloader.js';
export { type UploadOptions, type UploadResult } from './media/types.js';
export { aesEncrypt, aesDecrypt, md5, generateAesKey } from './media/crypto.js';

export { EventEmitter } from './utils/event-emitter.js';
export { Logger, type LoggerOptions } from './utils/logger.js';
