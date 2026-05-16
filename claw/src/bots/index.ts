import { logger } from "../logger.js";
import * as db from "../db.js";

import express from "express";
import { BotChannel, BotRole } from "../types.js";
import { CHANNEL_ROLES, DEFAULT_TALKIE_USER, createBotID } from "../config.js";
import { WeixinBot } from "./weixin-bot.js";
import { WebBot } from "./web-bot.js";
import { TalkieBot } from "./talkie-bot.js";

// botId → Bot，与数据库 all_bots 保持一致
const allBots = new Map<string, WeixinBot | WebBot | TalkieBot>();

function registerBot(bot: WeixinBot | WebBot | TalkieBot, boundAt?: string): void {
  const botId = bot.getBotId();
  allBots.set(botId, bot);
  db.upsertBot({
    botId: bot.getBotId(),
    userId: bot.userId,
    channel: bot.channel,
    role: bot.role,
    folder: bot.folder,
    sessionId: bot.sessionId,
    botToken: bot instanceof WeixinBot ? bot.botToken : "",
    boundAt: boundAt ?? new Date().toISOString(),
  });
  logger.info(
    {
      channel: bot.channel,
      role: bot.role,
      userId: bot.userId,
      folder: bot.folder,
      sessionId: bot.sessionId,
    },
    "bot registered (allBots + DB synced)",
  );
}

async function unregisterBot(botId: string): Promise<void> {
  const bot = allBots.get(botId);
  if (!bot) return;
  await bot.stop();

  allBots.delete(botId);
  logger.info({ role: bot.role, botId }, "bot unregistered");
}

export async function restartWeixinBot(
  userId: string,
  role: BotRole,
  botToken: string,
  sessionId?: string,
): Promise<void> {
  const botId = createBotID(userId, role);
  await unregisterBot(botId);

  const bot = await WeixinBot.create(userId, role, botToken, sessionId);
  const allTasks = db.getActiveTasksForBot(botId);
  if (allTasks.length === 0) {
    const intervalMs = 16 * 60 * 60 * 1000;
    const now = new Date();
    const nextRun = new Date(now.getTime() + intervalMs);
    db.createTask({
      id: `weixin-${Date.now()}`,
      bot_id: botId,
      prompt: "提醒用户，说一句话，否则容易掉线！",
      schedule_type: "interval",
      schedule_value: String(intervalMs),
      next_run: nextRun.toISOString(),
      status: "active",
      created_at: now.toISOString(),
    });
  }
  await bot.start();
  registerBot(bot);

  logger.info({ role: "weixin", userId }, "bot (re)started");
}

export async function restartWebBot(
  userId: string,
  role: BotRole,
  sessionId?: string,
): Promise<void> {
  if (!CHANNEL_ROLES["web"].includes(role)) {
    throw new Error(`role "${role}" is not allowed for web channel`);
  }

  const botId = createBotID(userId, role);
  await unregisterBot(botId);

  const bot = await WebBot.create(userId, role, sessionId);
  registerBot(bot);
  await bot.start();
  logger.info({ role: "web", userId }, "web bot (re)started");
}

export async function doWebChat(
  userId: string,
  role: BotRole,
  text: string,
  res: express.Response,
): Promise<void> {
  const botId = createBotID(userId, role);
  const bot = allBots.get(botId);
  if (!bot) {
    throw new Error(`bot not found: ${botId}`);
  }
  if (!(bot instanceof WebBot)) {
    throw new Error(`bot ${botId} is not a web bot`);
  }

  await bot.runQuery(text, res);
}

export async function doTalkieChat(
  text: string,
  res: express.Response,
): Promise<void> {
  // 默认发给 talkie 频道的 default-talker 用户
  const botId = createBotID(DEFAULT_TALKIE_USER, "talker");
  const bot = allBots.get(botId);
  if (!bot) {
    throw new Error(`bot not found: ${botId}`);
  }
  if (!(bot instanceof TalkieBot)) {
    throw new Error(`bot ${botId} is not a Talkie bot`);
  }

  await bot.runQuery(text, res);
}

// 启动加载
export async function startBots(): Promise<void> {
  const bots = db.getAllBots();
  for (const b of bots) {
    if (b.channel === "web") {
      const bot = await WebBot.create(b.userId, b.role, b.sessionId);
      registerBot(bot, b.boundAt);
      await bot.start();
    } else if (b.channel === "talkie") {
      const bot = await TalkieBot.create(b.userId, b.role, b.sessionId);
      registerBot(bot, b.boundAt);
      await bot.start();
    } else {
      const bot = await WeixinBot.create(
        b.userId,
        b.role,
        b.botToken,
        b.sessionId,
      );
      registerBot(bot, b.boundAt);
      await bot.start();
    }
    logger.info(
      { channel: b.channel, role: b.role, userId: b.userId },
      "bot loaded from db",
    );
  }
}

// 定时启动对话
export async function scheduleBot(
  botId: string,
  prompt: string,
): Promise<void> {
  const bot = allBots.get(botId);
  if (!bot) {
    logger.warn({ botId }, "scheduleBot: bot not found");
    return;
  }
  if (bot instanceof WeixinBot) {
    await bot.runQuery(prompt);
  }
}
