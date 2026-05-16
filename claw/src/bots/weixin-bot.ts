import path from "path";
import fs from "fs";
import { logger } from "../logger.js";
import * as db from "../db.js";

import { AgentSession } from "@mariozechner/pi-coding-agent";
import { ImageContent } from "@mariozechner/pi-ai";
import { createSessionByRole } from "../agents/index.js";
import { BotDeps, BotRole, BotChannel } from "../types.js";
import {
  CHANNEL_ROLES,
  DATA_DIR,
  toUserFolder,
  createBotID,
} from "../config.js";
import { WechatClient } from "../channels/weixin.js";
import { formatMessages } from "./utils.js";
import { create } from "domain";

interface QueueItem {
  text: string;
  imgContent?: ImageContent;
}

const STEER_THRESHOLD = 2;

export class WeixinBot implements BotDeps {
  role: BotRole = "app-assistant";
  channel: BotChannel = "weixin";
  userId = "";
  folder = "";
  sessionId = "";
  botToken = "";
  online = false;
  session!: AgentSession;
  wxClient: WechatClient;

  private messageQueue: QueueItem[] = [];
  private queueResolve: (() => void) | null = null;
  private consumerAbort = false;

  private constructor(
    userId: string,
    role: BotRole,
    token: string,
    sessionId?: string,
  ) {
    this.userId = userId;
    this.role = role;
    this.botToken = token;
    this.folder = toUserFolder(userId, "weixin");
    fs.mkdirSync(this.folder, { recursive: true });

    if (sessionId) {
      this.sessionId = sessionId;
    }

    this.wxClient = new WechatClient(userId, token, this.folder);
    this.wxClient.setHandlers({
      onText: (text) => this.runQuery(text),
      onFile: (filePath, mimeType) => this.handleFile(filePath, mimeType),
      onAuthExpired: () => {
        WeixinBot.onAuthExpired?.(this.userId);
      },
    });
  }

  /** Set by the bot manager to handle auth expiration */
  static onAuthExpired: ((userId: string) => void) | null = null;

  static async create(
    userId: string,
    role: BotRole,
    token: string,
    sessionId?: string,
  ): Promise<WeixinBot> {
    const validRoles = CHANNEL_ROLES["weixin"];
    if (!validRoles.includes(role)) {
      throw new Error(
        `Invalid role "${role}" for weixin channel, allowed: ${validRoles.join(", ")}`,
      );
    }

    const bot = new WeixinBot(userId, role, token, sessionId);

    const { session } = await createSessionByRole[role](bot.sessionId, bot);
    bot.session = session;
    if (bot.sessionId !== session.sessionId) {
      bot.sessionId = session.sessionId;
    }
    return bot;
  }

  async stop(): Promise<void> {
    if (!this.online) return;
    this.online = false;
    this.consumerAbort = true;
    this.wakeConsumer();
    this.wxClient.stop();
  }

  async start(): Promise<void> {
    if (this.online) {
      return;
    }

    this.wxClient.start();
    this.online = true;
    this.consumerAbort = false;
    void this.consumerLoop();
  }

  private handleFile(filePath: string, mimeType: string | null): void {
    if (!fs.existsSync(filePath)) {
      logger.info(`[WeChat] Downloaded file not found: ${filePath}`);
      return;
    }
    const supportedImage =
      this.session.agent.state.model.input.includes("image");
    if (mimeType && supportedImage) {
      const data = fs.readFileSync(filePath).toString("base64");
      const imgContent: ImageContent = { type: "image", data, mimeType };
      void this.runQuery(
        "用户发送了一张图片，先理解一下这个图片内容！",
        imgContent,
      );
    } else {
      const fileName = path.basename(filePath);
      void this.runQuery(`用户发送了一个文件: ${fileName}`);
    }
  }

  public async runQuery(text: string, imgContent?: ImageContent) {
    if (this.messageQueue.length >= STEER_THRESHOLD) {
      try {
        const prompt = formatMessages(text, "txt");
        await this.session.prompt(prompt, {
          streamingBehavior: "steer",
        });
      } catch (err) {
        logger.error({ err }, "Steer failed, falling back to enqueue");
        this.messageQueue.push({ text, imgContent });
        this.wakeConsumer();
      }
      return;
    }
    this.messageQueue.push({ text, imgContent });
    this.wakeConsumer();
  }

  private wakeConsumer() {
    if (this.queueResolve) {
      this.queueResolve();
      this.queueResolve = null;
    }
  }

  private async waitOnQueue(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queueResolve = resolve;
    });
  }

  private async consumerLoop() {
    while (!this.consumerAbort) {
      if (this.messageQueue.length === 0) {
        await this.waitOnQueue();
        continue;
      }
      const item = this.messageQueue.shift()!;
      try {
        await this.wxClient.sendTyping(true);
        await this.doQuery(item.text, item.imgContent);
        await this.wxClient.sendTyping(false);
      } catch (err) {
        logger.error({ err }, "Consumer loop error");
      }
    }
  }

  private async doQuery(
    text: string,
    imgContent?: ImageContent,
  ): Promise<void> {
    text = formatMessages(text, "txt");

    try {
      if (!imgContent) {
        await this.session.prompt(text);
      } else {
        await this.session.prompt(text, {
          images: [imgContent],
        });
      }

      const last = this.session.state.messages.length - 1;
      const msg = this.session.state.messages[last];
      if (msg.role === "assistant") {
        if (msg.errorMessage) {
          await this.sendMessage(msg.errorMessage);
        } else {
          let longMessage = "";
          msg.content.forEach((m) => {
            if (m.type == "text") {
              if (longMessage.length > 0) {
                longMessage = longMessage + "\n";
              }
              longMessage = longMessage + m.text;
            }
          });
          await this.sendMessage(longMessage);
        }
      }
    } catch (err) {
      logger.error({ err }, "Agent query failed");
      await this.sendMessage(String(err));
    }
  }

  getBotId(): string {
    return createBotID(this.userId, this.role);
  }
  getFolder(): string {
    return this.folder;
  }

  async sendMessage(text: string): Promise<void> {
    await this.wxClient.sendMessage(text);
  }

  async sendFile(filePath: string): Promise<void> {
    await this.wxClient.sendFile(filePath);
  }
}
