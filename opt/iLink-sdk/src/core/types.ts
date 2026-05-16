/** Default iLink API base URL. */
export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';

/** Default CDN base URL for media upload/download. */
export const DEFAULT_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';

export interface AccountConfig {
  accountId: string;
  token?: string;
  userId?: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
}

export interface WeixinConfig {
  baseUrl?: string;
  cdnBaseUrl?: string;
  timeout?: number;
  longPollTimeoutMs?: number;
  retries?: number;
  autoRefreshToken?: boolean;
  tokenRefreshThreshold?: number;
  defaultBotType?: string;
  messageChunkLimit?: number;
  pollingInterval?: number;
  logLevel?: LogLevel;
  enableConsoleLog?: boolean;
  account?: AccountConfig;
}

export type ResolvedWeixinAccount = {
  accountId: string;
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
};

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface AuthResult {
  token: string;
  userId: string;
  expiresAt: number;
  refreshToken?: string;
  accountId?: string;
  baseUrl?: string;
}
