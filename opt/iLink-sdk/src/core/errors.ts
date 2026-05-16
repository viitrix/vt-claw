export enum ErrorCode {
  AUTH_REQUIRED = 1001,
  AUTH_FAILED = 1002,
  TOKEN_EXPIRED = 1003,
  
  NETWORK_ERROR = 2001,
  TIMEOUT = 2002,
  RATE_LIMIT = 2003,
  
  API_ERROR = 3001,
  INVALID_RESPONSE = 3002,
  SERVER_ERROR = 3003,
  
  MESSAGE_INVALID = 4001,
  MESSAGE_TOO_LARGE = 4002,
  MEDIA_UPLOAD_FAILED = 4003,
  
  INVALID_CONFIG = 5001,
  MISSING_REQUIRED = 5002
}

export class WeixinSDKError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(`[${ErrorCode[code]}] ${message}`);
    this.name = 'WeixinSDKError';
    this.code = code;
    this.details = details;
  }
}
