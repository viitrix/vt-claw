import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileTypeFromFile } from "file-type";
import { logger } from "../logger.js";
import { ChannelOpts, Channel, NewMessage } from "../types.js";
import {
  wechat_login,
  WeChatAuthInfo,
  WECHAT_AUTH_FILE,
  WECHAT_BASE_URL,
  WECHAT_CDN_URL,
} from "./login.js";
/*
// https://github.com/abczsl520/weixin-bot-sdk
import { WeixinBot } from "./sdk/index.js";
import type { ParsedMessage } from "./sdk/types.js";
*/
// https://github.com/NebulaMao/wechat-iLink-sdk-typescript
import {
  WeixinSDK,
  TokenAuthProvider,
  UploadMediaType,
  WeixinMessage,
  MessageItemType,
  DownloadedMedia,
  TypingStatus,
} from "@xmccln/wechat-ilink-sdk";
import { ref } from "node:process";

function extractText(message: WeixinMessage): string {
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

function hasVideo(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.VIDEO &&
        item.video_item?.media?.encrypt_query_param,
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

function hasVoice(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.VOICE &&
        item.voice_item?.media?.encrypt_query_param,
    ),
  );
}

function getFirstFileName(message: WeixinMessage): string | undefined {
  return message.item_list?.find((item) => item.type === MessageItemType.FILE)
    ?.file_item?.file_name;
}

export class WeChatChannel implements Channel {
  name = "";
  jid = "";
  folder = "";
  private opts: ChannelOpts;
  private bot: WeixinSDK;
  private connected = false;
  private auth: WeChatAuthInfo;
  // Track current conversation context for replies
  private currentContextToken: string | undefined = undefined;
  private currentFromUser: string | undefined = undefined;
  private currentTypingTicket: string | undefined = undefined;
  // Track downloading resources
  private downloadingCount = 0;
  private downloadFiles: DownloadedMedia[] = [];
  private penddings: NewMessage[] = [];

  private constructor(auth: WeChatAuthInfo, opts: ChannelOpts) {
    this.name = `WeChat-${auth.userId}`.slice(0, 15);
    this.jid = `wx-${auth.userId}`;
    this.folder = "wx-" + auth.userId.split("@")[0];
    this.opts = opts;
    this.auth = auth;

    this.bot = new WeixinSDK({
      config: {
        baseUrl: WECHAT_BASE_URL,
        cdnBaseUrl: WECHAT_CDN_URL,
        timeout: 35000,
      },
      auth: new TokenAuthProvider(this.auth.botToken, this.auth.userId),
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle incoming messages
    this.bot.onMessage((msg) => {
      this.handleIncomingMessage(msg);
    });

    this.bot.on("error", (error) => {
      console.error("❌ SDK error:", error);
    });
  }

  private handleIncomingMessage(msg: WeixinMessage): void {
    if (msg.from_user_id) {
      if (this.currentFromUser !== msg.from_user_id) {
        this.currentTypingTicket = undefined;
      }
      this.currentFromUser = msg.from_user_id;
    }
    if (msg.context_token) {
      if (this.currentContextToken !== msg.context_token) {
        this.currentTypingTicket = undefined;
      }
      this.currentContextToken = msg.context_token;
    }

    const text = extractText(msg);
    const hasInboundImage = hasImage(msg);
    const hasInboundVideo = hasVideo(msg);
    const hasInboundFile = hasFile(msg);
    const hasInboundVoice = hasVoice(msg);

    if (text) {
      // Create the message object
      const newMessage: NewMessage = {
        id: crypto.randomUUID(),
        jid: this.jid,
        role: "bot",
        type: "text",
        content: text,
        timestamp: new Date().toISOString(),
      };
      // Deliver to the callback
      if (this.downloadingCount == 0) {
        this.opts.onMessage(this.jid, newMessage);
      } else {
        this.penddings.push(newMessage);
      }
      return;
    }
    if (hasInboundVoice || hasInboundVideo) {
      this.sendMessage("text", "我暂时无法处理这种格式！");
    }
    if (hasInboundImage) {
      this.downloadingCount++;
      this.bot.media.downloader
        .downloadImage(msg)
        .then((result) => this.handleDownloadedFile(result))
        .finally(() => {
          this.downloadingCount--;
          this.flushPenddings().catch((err) =>
            logger.debug(
              `[WeChat] flushPenddings error: ${(err as Error).message}`,
            ),
          );
        });
    }
    if (hasInboundFile) {
      this.downloadingCount++;
      this.bot.media.downloader
        .downloadFile(msg)
        .then((result) => this.handleDownloadedFile(result))
        .finally(() => {
          this.downloadingCount--;
          this.flushPenddings().catch((err) =>
            logger.debug(
              `[WeChat] flushPenddings error: ${(err as Error).message}`,
            ),
          );
        });
    }
  }

  private handleDownloadedFile(result: DownloadedMedia | null): void {
    if (result) {
      this.downloadFiles.push(result);
    }
  }

  private async flushPenddings(): Promise<void> {
    if (this.downloadingCount > 0) return;

    for (const download of this.downloadFiles) {
      try {
        const fileType = download.type == "image" ? "image" : "file";
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
          const newMessage: NewMessage = {
            id: crypto.randomUUID(),
            jid: this.jid,
            role: "bot",
            type: fileType,
            content: newPath,
            timestamp: new Date().toISOString(),
          };
          this.opts.onMessage(this.jid, newMessage);
        }
      } catch (err) {
        logger.debug(
          `[WeChat] Failed to detect/rename file: ${(err as Error).message}`,
        );
      }
    }

    // Deliver all pending messages
    for (const msg of this.penddings) {
      this.opts.onMessage(this.jid, msg);
    }
    this.penddings = [];
  }

  static async create(opts: ChannelOpts): Promise<WeChatChannel> {
    const auth = await wechat_login();
    const channel = new WeChatChannel(auth, opts);
    return channel;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Start polling for messages
      this.bot.start();
      this.connected = true;
      logger.info(`[WeChat] Channel connected: ${this.name}`);
    } catch (err) {
      logger.error(`[WeChat] Connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    this.bot.stop();
    this.connected = false;
    logger.info(`[WeChat] Channel disconnected: ${this.name}`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendMessage(
    type: "text" | "image" | "file",
    content: string,
  ): Promise<void> {
    if (!this.connected || !this.currentFromUser) {
      throw new Error("Not connected or no active conversation");
    }

    try {
      switch (type) {
        case "text": {
          await this.bot.sendText(
            this.currentFromUser,
            content,
            this.currentContextToken,
          );
          break;
        }
        case "image": {
          // content should be a file path or URL, read and send
          await this.bot.messaging.sender.sendMedia({
            to: this.currentFromUser,
            filePath: content,
            mediaType: UploadMediaType.IMAGE,
            contextToken: this.currentContextToken,
          });
          break;
        }
        case "file": {
          // content should be a file path or URL, read and send
          await this.bot.messaging.sender.sendMedia({
            to: this.currentFromUser,
            filePath: content,
            mediaType: UploadMediaType.FILE,
            contextToken: this.currentContextToken,
          });
          break;
        }
      }
    } catch (err) {
      logger.error(`[WeChat] Send message failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async setTyping(isTyping: boolean): Promise<void> {
    if (!this.connected || !this.currentFromUser) return;

    try {
      const apiEndpoints = (
        this.bot as unknown as {
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
        this.currentTypingTicket = config.typing_ticket;
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
      // Typing indicator is optional, don't throw
      logger.debug(`[WeChat] sendTyping failed: ${(err as Error).message}`);
    }
  }
}
