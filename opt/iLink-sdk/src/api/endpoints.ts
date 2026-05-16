import { ApiClient } from './client.js';
import { ErrorCode, WeixinSDKError } from '../core/errors.js';
import type {
  GetUpdatesReq,
  GetUpdatesResp,
  SendMessageReq,
  SendMessageResp,
  GetUploadUrlReq,
  GetUploadUrlResp,
  SendTypingReq,
  SendTypingResp,
  GetConfigResp,
  GetConfigReq,
} from './types.js';

export class ApiEndpoints {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async getUpdates(params: GetUpdatesReq): Promise<GetUpdatesResp> {
    try {
      const response = await this.client.request<GetUpdatesResp>({
        method: 'POST',
        path: '/ilink/bot/getupdates',
        data: {
          get_updates_buf: params.get_updates_buf ?? '',
        },
        timeout: this.client.getConfig().longPollTimeoutMs ?? 35000,
      });
      return response.data;
    } catch (error) {
      if (error instanceof WeixinSDKError && error.code === ErrorCode.TIMEOUT) {
        return {
          ret: 0,
          msgs: [],
          get_updates_buf: params.get_updates_buf,
        };
      }
      throw error;
    }
  }

  async sendMessage(message: SendMessageReq): Promise<SendMessageResp> {
    const response = await this.client.request<SendMessageResp>({
      method: 'POST',
      path: '/ilink/bot/sendmessage',
      data: message,
    });
    return response.data;
  }

  async getUploadUrl(params: GetUploadUrlReq): Promise<GetUploadUrlResp> {
    const response = await this.client.request<GetUploadUrlResp>({
      method: 'POST',
      path: '/ilink/bot/getuploadurl',
      data: params,
    });
    return response.data;
  }

  async sendTyping(params: SendTypingReq): Promise<SendTypingResp> {
    const response = await this.client.request<SendTypingResp>({
      method: 'POST',
      path: '/ilink/bot/sendtyping',
      data: params,
    });
    return response.data;
  }

  async getConfig(params: GetConfigReq): Promise<GetConfigResp> {
    const response = await this.client.request<GetConfigResp>({
      method: 'POST',
      path: '/ilink/bot/getconfig',
      data: params,
    });
    return response.data;
  }
}
