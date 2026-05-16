import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import {
  getQrcode,
  queryQrcodeStatus,
  WECHAT_BASE_URL,
} from "./channels/weixin.js";
import QRCode from "qrcode";

import path from "node:path";
import fs from "node:fs";

import { restartWeixinBot, restartWebBot, doWebChat, doTalkieChat} from "./bots/index.js";
import * as db from "./db.js";
import { BotRole, BotChannel } from "./types.js";
import {
  CHANNEL_ROLES,
  BOT_ROLE_INFO,
  toHostPath,
  toUserFolder,
} from "./config.js";

// --------------- multi-session login state ---------------
interface LoginBinding {
  rid: string;
  qrcode: string;
  userId?: string;
  role?: BotRole;
  token?: string;
  qrcodeImage?: Buffer;
  confirmed?: boolean;
}

/** rid(random id) → session(qrcode + token) */
const allLogins = new Map<string, LoginBinding>();

async function generateQrImage(content: string): Promise<Buffer> {
  return await QRCode.toBuffer(content, { width: 280, margin: 2 });
}

function clearSession(rid: string) {
  allLogins.delete(rid);
}

function getShareFolder(userId: string, channel: BotChannel): string | null {
  const folder = toUserFolder(userId, channel);
  try {
    return toHostPath(folder);
  } catch {
    logger.warn({ folder }, "Folder is outside store directory");
    return null;
  }
}

// --------------- API handlers ---------------

function handleRoles(req: express.Request, res: express.Response) {
  const { channel } = req.query as { channel?: string };
  if (!channel) {
    res.status(400).json({ error: "channel is required" });
    return;
  }

  const roles = CHANNEL_ROLES[channel as BotChannel];
  if (!roles) {
    res.status(400).json({ error: `unknown channel: ${channel}` });
    return;
  }

  const roleInfos = roles.map((r) => BOT_ROLE_INFO[r]);
  res.json({ status: "ok", roles: roleInfos });
}
async function handleWxLogin(req: express.Request, res: express.Response) {
  const { role } = req.query as { role?: BotRole };
  if (!role) {
    res.status(400).json({ error: "role is required" });
    return;
  }
  const validRoles = CHANNEL_ROLES["weixin"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `invalid role: ${role}` });
    return;
  }

  try {
    const rid = crypto.randomUUID();
    const qrResp = await getQrcode(WECHAT_BASE_URL);
    const qrcodeImage = await generateQrImage(qrResp.qrcode_img_content);
    allLogins.set(rid, {
      rid,
      role,
      qrcode: qrResp.qrcode,
      qrcodeImage,
    });

    res.json({ status: "ok", qrcode: qrResp.qrcode, rid: rid });
  } catch (err) {
    logger.error({ err }, "Failed to start login");
    res.status(500).json({ status: "error", error: String(err) });
  }
}

async function handleQrStatus(req: express.Request, res: express.Response) {
  const { rid } = req.query as { rid?: string };
  if (!rid) {
    res.status(400).json({ status: "error", error: "rid is required" });
    return;
  }

  const s = allLogins.get(rid);
  if (!s) {
    res.status(400).json({ status: "error", error: "Can't find qrcode!" });
    return;
  }
  if (s.confirmed) {
    res.json({ status: "confirmed" });
    return;
  }
  const qrcode = s.qrcode;
  const statusResp = await queryQrcodeStatus(WECHAT_BASE_URL, qrcode);
  switch (statusResp.status) {
    case "wait":
      break;

    case "scaned":
      break;

    case "expired": {
      clearSession(rid);
      break;
    }

    case "confirmed": {
      const newUserId = statusResp.ilink_user_id;
      console.log("\n✅ 登录成功！\n");
      s.confirmed = true;
      s.userId = newUserId;
      s.token = statusResp.bot_token;

      const existing = db.getBot(newUserId, s.role!);
      void restartWeixinBot(s.userId!, s.role!, s.token!, existing?.sessionId);
      break;
    }
  }

  res.json({ status: statusResp.status });
}

function handleQrcodeImage(req: express.Request, res: express.Response) {
  const { rid } = req.query as { rid?: string };
  if (!rid) {
    res.status(400).json({ error: "rid is required" });
    return;
  }

  const s = allLogins.get(rid);
  if (!s?.qrcodeImage) {
    res.status(404).json({ error: "no qrcode" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-cache",
  });
  res.end(s.qrcodeImage);
}

function handleRegisterWebUser(req: express.Request, res: express.Response) {
  const { uid, role } = req.query as { uid?: string; role?: BotRole };
  if (!uid || !role) {
    res.status(400).json({ error: "uid and role are required" });
    return;
  }
  const validRoles = CHANNEL_ROLES["web"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `invalid role: ${role}` });
    return;
  }

  const existing = db.getBot(uid, role);
  void restartWebBot(uid, role, existing?.sessionId);

  res.json({ status: "ok" });
}

async function handleWebChat(req: express.Request, res: express.Response) {
  const { uid, text, role } = req.body as {
    uid?: string;
    text?: string;
    role?: BotRole;
  };
  if (!uid || !text || !role) {
    res.status(400).json({ error: "uid, text and role are required" });
    return;
  }

  logger.info({ uid, role, text }, "Received web chat request");

  const validRoles = CHANNEL_ROLES["web"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `invalid role: ${role}` });
    return;
  }

  const bot = db.getBot(uid, role);
  if (!bot) {
    res.status(404).json({ error: "bot not found" });
    return;
  }

  try {
    await doWebChat(uid, role, text, res);
  } catch (err) {
    logger.error({ err }, "Web chat failed");
    if (!res.headersSent) {
      res.status(500).json({ status: "error", error: String(err) });
    }
  }
}

function handleShareFolder(req: express.Request, res: express.Response) {
  const { uid, channel } = req.query as { uid?: string; channel?: BotChannel };
  if (!uid || !channel) {
    res.status(400).json({ error: "uid and channel are required" });
    return;
  }

  const folder = getShareFolder(uid, channel);
  if (!folder) {
    res.status(404).json({ error: "no share folder configured for this user" });
    return;
  }

  res.json({ status: "ok", folder });
}

async function handleTalkie(req: express.Request, res: express.Response) {
  const { text } = req.body as { text: string };
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    await doTalkieChat(text, res);
  } catch (err) {
    logger.error({ err }, "Talkie chat failed");
    if (!res.headersSent) {
      res.status(500).json({ status: "error", error: String(err) });
    }
  }
}

// --------------- app factory ---------------

export function createApp() {
  const app = express();

  // built-in middleware
  app.use(cors());
  app.use(express.json());

  // Common api
  app.get("/api/roles", handleRoles);
  app.get("/api/share-folder", handleShareFolder);

  // Weixin login flow
  app.post("/api/wxlogin", handleWxLogin);
  app.get("/api/qrcode", handleQrcodeImage);
  app.get("/api/qrstatus", handleQrStatus);

  // Other API endpoints
  app.get("/api/register-web-user", handleRegisterWebUser);
  app.post("/api/web-chat", handleWebChat);
  app.post("/api/talkie-chat", handleTalkie);

  return app;
}

export async function startServer(port: number) {
  const app = createApp();
  const server = app.listen(port, () => {
    logger.info({ port }, "API server listening");
  });
  return server;
}
