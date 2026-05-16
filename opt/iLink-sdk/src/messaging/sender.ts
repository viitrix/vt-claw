import { ApiEndpoints } from '../api/endpoints.js';
import { MediaUploader } from '../media/uploader.js';
import { MessageItemType, MessageState, MessageType } from '../api/types.js';
import type { WeixinMessage, MessageItem } from '../api/types.js';
import crypto from 'crypto';
import path from 'path';

export interface SendTextOptions {
  to: string;
  text: string;
  contextToken?: string;
}

export interface SendMediaOptions {
  to: string;
  filePath: string;
  mediaType: number;
  fileName?: string;
  text?: string;
  contextToken?: string;
  cdnBaseUrl?: string;
}

function mediaTypeToItemType(mediaType: number): number {
  switch (mediaType) {
    case 1: return MessageItemType.IMAGE;
    case 2: return MessageItemType.VIDEO;
    case 3: return MessageItemType.FILE;
    case 4: return MessageItemType.VOICE;
    default: return MessageItemType.NONE;
  }
}

function generateClientId(): string {
  return crypto.randomUUID();
}

function encodeMediaAesKey(aesKeyHex: string): string {
  return Buffer.from(aesKeyHex, 'utf-8').toString('base64');
}

export class MessageSender {
  constructor(
    private api: ApiEndpoints,
    private mediaUploader: MediaUploader
  ) {}

  async sendText(options: SendTextOptions): Promise<void> {
    const { to, text, contextToken } = options;

    const message: WeixinMessage = {
      to_user_id: to,
      client_id: generateClientId(),
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      item_list: [
        {
          type: MessageItemType.TEXT,
          text_item: { text },
        },
      ],
      context_token: contextToken,
    };

    await this.api.sendMessage({ msg: message });
  }

  async sendMedia(options: SendMediaOptions): Promise<void> {
    const { to, filePath, mediaType, fileName, text, contextToken, cdnBaseUrl } = options;

    const uploadResult = await this.mediaUploader.upload({
      filePath,
      mediaType,
      toUserId: to,
      cdnBaseUrl,
    });

    const item_list: MessageItem[] = [];

    const itemType = mediaTypeToItemType(mediaType);

    if (itemType === MessageItemType.IMAGE) {
      item_list.push({
        type: itemType,
        image_item: {
          media: {
            encrypt_query_param: uploadResult.downloadParam,
            aes_key: encodeMediaAesKey(uploadResult.aesKey),
            encrypt_type: 1,
          },
          mid_size: uploadResult.fileSizeCiphertext,
        },
      });
    } else if (itemType === MessageItemType.VIDEO) {
      item_list.push({
        type: itemType,
        video_item: {
          media: {
            encrypt_query_param: uploadResult.downloadParam,
            aes_key: encodeMediaAesKey(uploadResult.aesKey),
            encrypt_type: 1,
          },
          video_size: uploadResult.fileSizeCiphertext,
        },
      });
    } else if (itemType === MessageItemType.VOICE) {
      item_list.push({
        type: itemType,
        voice_item: {
          media: {
            encrypt_query_param: uploadResult.downloadParam,
            aes_key: encodeMediaAesKey(uploadResult.aesKey),
            encrypt_type: 1,
          },
        },
      });
    } else {
      item_list.push({
        type: itemType,
        file_item: {
          media: {
            encrypt_query_param: uploadResult.downloadParam,
            aes_key: encodeMediaAesKey(uploadResult.aesKey),
            encrypt_type: 1,
          },
          file_name: fileName ?? path.basename(filePath),
          len: String(uploadResult.fileSize),
        },
      });
    }

    if (text) {
      item_list.push({
        type: MessageItemType.TEXT,
        text_item: { text },
      });
    }

    const message: WeixinMessage = {
      to_user_id: to,
      client_id: generateClientId(),
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      item_list,
      context_token: contextToken,
    };

    await this.api.sendMessage({ msg: message });
  }
}
