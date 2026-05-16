import path from "path";
import fs from "fs";
import { logger } from "../logger.js";

import express from "express";
import {
  AgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { ImageContent } from "@mariozechner/pi-ai";
import { createSessionByRole } from "../agents/index.js";
import { BotDeps, BotRole, BotChannel } from "../types.js";
import {
  CHANNEL_ROLES,
  DATA_DIR,
  createBotID,
  toUserFolder,
} from "../config.js";
import { formatMessages } from "./utils.js";

export class WebBot implements BotDeps {
  role: BotRole = "assistant";
  channel: BotChannel = "web";
  userId = "";
  folder = "";
  sessionId = "";
  session!: AgentSession;
  private unsubscribe: (() => void) | null = null;
  private currentRes: express.Response | null = null;
  private fileQueue: string[] = [];

  private constructor(userId: string, role: BotRole, sessionId?: string) {
    this.userId = userId;
    this.role = role;
    this.folder = toUserFolder(userId, "web");
    fs.mkdirSync(this.folder, { recursive: true });

    if (sessionId) {
      this.sessionId = sessionId;
    }
  }

  static async create(
    userId: string,
    role: BotRole,
    sessionId?: string,
  ): Promise<WebBot> {
    const validRoles = CHANNEL_ROLES["web"];
    if (!validRoles.includes(role)) {
      throw new Error(
        `Invalid role "${role}" for web channel, allowed: ${validRoles.join(", ")}`,
      );
    }

    const bot = new WebBot(userId, role, sessionId);

    const { session } = await createSessionByRole[role](bot.sessionId, bot);
    bot.session = session;
    if (bot.sessionId !== session.sessionId) {
      bot.sessionId = session.sessionId;
    }
    return bot;
  }

  getBotId(): string {
    return createBotID(this.userId, this.role);
  }
  getFolder(): string {
    return this.folder;
  }

  async runQuery(
    text: string,
    res: express.Response,
    imgContent?: ImageContent,
  ): Promise<void> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    this.currentRes = res;
    try {
      const formatted = formatMessages(text, "txt");
      if (!imgContent) {
        await this.session.prompt(formatted);
      } else {
        await this.session.prompt(formatted, { images: [imgContent] });
      }
    } finally {
      this.currentRes = null;
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    }
  }

  private handleEvent(event: AgentSessionEvent): void {
    if (!this.currentRes || this.currentRes.writableEnded) return;

    switch (event.type) {
      case "message_update": {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent.type === "text_delta") {
          this.currentRes.write(
            `data: ${JSON.stringify({ type: "text_delta", delta: assistantEvent.delta })}\n\n`,
          );
        }
        break;
      }
      case "tool_execution_start": {
        this.currentRes.write(
          `data: ${JSON.stringify({ type: "tool_start", toolName: event.toolName })}\n\n`,
        );
        break;
      }
      case "tool_execution_end": {
        this.currentRes.write(
          `data: ${JSON.stringify({ type: "tool_end", toolName: event.toolName, isError: event.isError })}\n\n`,
        );
        break;
      }
    }
  }

  async start(): Promise<void> {
    logger.info(`Starting web bot: ${this.userId}`);
    this.unsubscribe = this.session.subscribe((event) =>
      this.handleEvent(event as AgentSessionEvent),
    );
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  async sendMessage(_text: string): Promise<void> {}

  async sendFile(filePath: string): Promise<void> {
    this.fileQueue.push(filePath);
    const relativePath = path.relative(this.folder, filePath);
    if (this.currentRes && !this.currentRes.writableEnded) {
      this.currentRes.write(
        `data: ${JSON.stringify({ type: "file", relativePath })}\n\n`,
      );
    }
  }
}
