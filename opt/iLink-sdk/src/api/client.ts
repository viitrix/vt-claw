import { WeixinSDKError, ErrorCode } from '../core/errors.js';
import { type WeixinConfig, DEFAULT_BASE_URL } from '../core/types.js';
import type { BaseInfo } from './types.js';

export interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

function buildBaseInfo(): BaseInfo {
  return { channel_version: 'weixin-sdk/1.0.0' };
}

function randomWechatUin(): string {
  const value = Math.floor(Math.random() * 0x1_0000_0000);
  return Buffer.from(String(value), 'utf-8').toString('base64');
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class ApiClient {
  private readonly config: WeixinConfig;
  private authToken: string | null = null;

  constructor(config: WeixinConfig) {
    this.config = config;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  getConfig(): WeixinConfig {
    return this.config;
  }

  async request<T>(options: ApiRequestOptions): Promise<ApiResponse<T>> {
    const { method, path, data, headers: customHeaders, timeout: customTimeout } = options;

    const url = `${this.config.baseUrl ?? DEFAULT_BASE_URL}${path}`;
    const timeout = customTimeout ?? this.config.timeout ?? 30000;
    const maxRetries = this.config.retries ?? 3;

    let lastError: WeixinSDKError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, this.calculateBackoff(attempt)));
      }

      try {
        const result = await this.executeRequest<T>(url, method, data, customHeaders, timeout);
        return result;
      } catch (error) {
        if (error instanceof WeixinSDKError) {
          lastError = error;

          if (!this.shouldRetry(error, attempt, maxRetries)) {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async executeRequest<T>(
    url: string,
    method: string,
    data: unknown,
    customHeaders: Record<string, string> | undefined,
    timeout: number
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const body = data === undefined ? undefined : JSON.stringify(this.attachBaseInfo(data));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': randomWechatUin(),
      'Content-Length': String(Buffer.byteLength(body ?? '', 'utf-8')),
      ...customHeaders,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await this.safeParseJson(response);
        throw this.createErrorFromStatus(response.status, errorData);
      }

      const responseData = await this.parseResponseBody(response);

      return {
        data: responseData as T,
        status: response.status,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof WeixinSDKError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new WeixinSDKError(ErrorCode.TIMEOUT, 'Request timed out', { url, timeout });
        }

        throw new WeixinSDKError(
          ErrorCode.NETWORK_ERROR,
          `Network error: ${error.message}`,
          { url, originalError: error.message }
        );
      }

      throw error;
    }
  }

  private shouldRetry(error: WeixinSDKError, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) {
      return false;
    }

    if (error.code === ErrorCode.NETWORK_ERROR) {
      return true;
    }

    if (error.code === ErrorCode.SERVER_ERROR) {
      return true;
    }

    return false;
  }

  private calculateBackoff(attempt: number): number {
    const baseDelay = 100;
    return baseDelay * Math.pow(2, attempt);
  }


  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await this.parseResponseBody(response);
    } catch {
      return null;
    }
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    if (typeof response.text === 'function') {
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    }

    if (typeof response.json === 'function') {
      return await response.json();
    }

    return {};
  }

  private attachBaseInfo(data: unknown): unknown {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }

    if ('base_info' in data) {
      return data;
    }

    return {
      ...(data as Record<string, unknown>),
      base_info: buildBaseInfo(),
    };
  }

  private createErrorFromStatus(status: number, details: unknown): WeixinSDKError {
    if (status === 429) {
      return new WeixinSDKError(ErrorCode.RATE_LIMIT, 'Rate limit exceeded', { status, details });
    }

    if (status >= 500) {
      return new WeixinSDKError(ErrorCode.SERVER_ERROR, `Server error: ${status}`, { status, details });
    }

    return new WeixinSDKError(ErrorCode.API_ERROR, `API error: ${status}`, { status, details });
  }
}
