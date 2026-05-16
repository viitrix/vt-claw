import fs from "node:fs";
import path from "node:path";
import qrcode from "qrcode";
import { fileTypeFromFile } from "file-type";
import { logger } from "../logger.js";

import {
  WeixinSDK,
  TokenAuthProvider,
  WeixinSDKError,
  ErrorCode,
  WeixinMessage,
  MessageItemType,
  DownloadedMedia,
  TypingStatus,
} from "iLink-sdk";

// 关于微信 ilink 相关配置
export const WECHAT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const WECHAT_CDN_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

const BOT_TYPE = 3;
export async function apiGet(baseUrl: string, path: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/${path}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

export async function getQrcode(baseUrl: string) {
  const path = `ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`;
  return await apiGet(baseUrl, path);
}

export async function queryQrcodeStatus(
  baseUrl: string,
  currentQrcode: string,
) {
  const path = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(currentQrcode)}`;
  return await apiGet(baseUrl, path);
}

function extractMessageText(message: WeixinMessage): string {
  for (const item of message.item_list ?? []) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text) {
      return item.text_item.text;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}

function hasImage(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.IMAGE &&
        item.image_item?.media?.encrypt_query_param,
    ),
  );
}

function hasFile(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.FILE &&
        item.file_item?.media?.encrypt_query_param,
    ),
  );
}

// ---------- WechatClient: WeChat SDK 二次封装 ----------

const IMAGE_MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function getImageMimeType(filePath: string): string | null {
  const mimeType = IMAGE_MIME_MAP[path.extname(filePath).toLowerCase()];
  return mimeType ?? null;
}

export interface WechatHandlers {
  onText: (text: string) => void;
  onFile: (filePath: string, mimeType: string | null) => void;
  onAuthExpired: () => void;
}

export class WechatClient {
  readonly userId: string;
  private dataDir: string;
  private wxsdk: WeixinSDK;
  private handlers!: WechatHandlers;
  online = false;

  private currentFromUser = "";
  private currentContextToken = "";
  private currentTypingTicket = "";
  private downloadingCount = 0;
  private downloadFiles: DownloadedMedia[] = [];
  private pendingTexts: string[] = [];

  constructor(userId: string, token: string, dataDir: string) {
    this.userId = userId;
    this.dataDir = dataDir;

    this.wxsdk = new WeixinSDK({
      config: {
        baseUrl: WECHAT_BASE_URL,
        cdnBaseUrl: WECHAT_CDN_URL,
        timeout: 35000,
      },
      auth: new TokenAuthProvider(token, userId),
    });

    this.wxsdk.on("error", (error: unknown) => {
      logger.error({ err: error }, "[WeChat] SDK error");
    });
  }

  setHandlers(handlers: WechatHandlers): void {
    this.handlers = handlers;
  }

  start(): void {
    if (this.online) return;
    this.wxsdk.onMessage((msg) => this.handleIncomingMessage(msg));
    void this.wxsdk.start();
    this.online = true;
  }

  stop(): void {
    if (!this.online) return;
    this.online = false;
    this.wxsdk.stop();
  }

  async sendTyping(isTyping: boolean): Promise<void> {
    if (!this.currentFromUser) return;

    try {
      const apiEndpoints = (
        this.wxsdk as unknown as {
          apiEndpoints?: {
            getConfig(params: {
              ilink_user_id?: string;
              context_token?: string;
            }): Promise<{ typing_ticket?: string }>;
            sendTyping(params: {
              ilink_user_id?: string;
              typing_ticket?: string;
              status?: number;
            }): Promise<unknown>;
          };
        }
      ).apiEndpoints;

      if (!apiEndpoints) return;

      if (!this.currentTypingTicket) {
        const config = await apiEndpoints.getConfig({
          ilink_user_id: this.currentFromUser,
          context_token: this.currentContextToken,
        });
        this.currentTypingTicket = config.typing_ticket ?? "";
      }

      if (!this.currentTypingTicket) {
        logger.debug("[WeChat] No typing_ticket returned, skipping typing");
        return;
      }

      await apiEndpoints.sendTyping({
        ilink_user_id: this.currentFromUser,
        typing_ticket: this.currentTypingTicket,
        status: isTyping ? TypingStatus.TYPING : TypingStatus.CANCEL,
      });
    } catch (err) {
      logger.debug(`[WeChat] sendTyping failed: ${(err as Error).message}`);
    }
  }

  async sendMessage(text: string): Promise<void> {
    try {
      await this.wxsdk.sendText(
        this.currentFromUser ?? this.userId,
        text,
        this.currentContextToken,
      );
    } catch (error) {
      if (error instanceof WeixinSDKError) {
        if (
          error.code === ErrorCode.TOKEN_EXPIRED ||
          error.code === ErrorCode.AUTH_FAILED
        ) {
          this.handlers.onAuthExpired();
        }
        logger.error({ err: error, code: error.code }, "[WeChat] send failed");
      } else {
        logger.error({ err: error }, "[WeChat] send failed");
      }
    }
  }

  async sendFile(filePath: string): Promise<void> {
    try {
      const to = this.currentFromUser || this.userId;
      const opts = { contextToken: this.currentContextToken };

      if (getImageMimeType(filePath)) {
        await this.wxsdk.sendImage(to, filePath, opts);
      } else {
        await this.wxsdk.sendFile(to, filePath, opts);
      }
    } catch (error) {
      logger.error({ err: error }, "[WeChat] sendFile failed");
    }
  }

  private handleIncomingMessage(msg: WeixinMessage): void {
    if (msg.from_user_id) {
      if (this.currentFromUser !== msg.from_user_id) {
        this.currentTypingTicket = "";
      }
      this.currentFromUser = msg.from_user_id;
    }
    if (msg.context_token) {
      if (this.currentContextToken !== msg.context_token) {
        this.currentTypingTicket = "";
      }
      this.currentContextToken = msg.context_token;
    }

    const text = extractMessageText(msg);
    const hasInboundImage = hasImage(msg);
    const hasInboundFile = hasFile(msg);

    if (text) {
      const prompt = text.trim();
      if (prompt.length > 0) {
        if (this.downloadingCount === 0) {
          this.handlers.onText(prompt);
        } else {
          this.pendingTexts.push(prompt);
        }
      }
      return;
    }
    if (hasInboundImage) {
      this.downloadingCount++;
      this.wxsdk.media.downloader
        .downloadImage(msg)
        .then((result) => {
          if (result) this.downloadFiles.push(result);
        })
        .finally(() => {
          this.downloadingCount--;
          this.flushDownloads();
        });
    }
    if (hasInboundFile) {
      this.downloadingCount++;
      this.wxsdk.media.downloader
        .downloadFile(msg)
        .then((result) => {
          if (result) this.downloadFiles.push(result);
        })
        .finally(() => {
          this.downloadingCount--;
          this.flushDownloads();
        });
    }
  }

  private async flushDownloads(): Promise<void> {
    if (this.downloadingCount > 0) return;

    const receivedDir = path.join(this.dataDir, "received");
    fs.mkdirSync(receivedDir, { recursive: true });

    const files = this.downloadFiles;
    this.downloadFiles = [];

    for (const download of files) {
      try {
        const detected = await fileTypeFromFile(download.path);
        if (detected) {
          const ext = detected.ext;
          const dir = path.dirname(download.path);
          const baseName = path.basename(
            download.path,
            path.extname(download.path),
          );
          const newPath = path.join(dir, `${baseName}.${ext}`);
          if (download.path !== newPath) {
            fs.renameSync(download.path, newPath);
          }

          const destPath = path.join(receivedDir, `${baseName}.${ext}`);
          try {
            fs.renameSync(newPath, destPath);
          } catch {
            fs.copyFileSync(newPath, destPath);
            fs.unlinkSync(newPath);
          }

          const mimeType = getImageMimeType(destPath);
          this.handlers.onFile(destPath, mimeType);
        } else {
          logger.info(`[WeChat] Failed to detect file type: ${download.path}`);
        }
      } catch (err) {
        logger.error(
          { err },
          `Failed to process downloaded file: ${download.path}`,
        );
      }
    }

    for (const text of this.pendingTexts) {
      this.handlers.onText(text);
    }
    this.pendingTexts = [];
  }
}
