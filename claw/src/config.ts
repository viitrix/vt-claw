import path from "path";
import crypto from "crypto";
import { BotChannel, BotRole, BotRoleInfo } from "./types.js";

const PROJECT_ROOT = process.cwd();
export const STORE_DIR =
  process.env.STORE_DIR ||
  path.resolve(PROJECT_ROOT, "..", "container", "workspace");
export const HOST_STORE_DIR =
  process.env.HOST_STORE_DIR ||
  path.resolve(PROJECT_ROOT, "..", "container", "workspace");

export const DATA_DIR = path.resolve(STORE_DIR, "data");
export const SESSION_DIR = path.resolve(STORE_DIR, "session");
export const PI_DIR =
  process.env.PI_DIR || path.resolve(PROJECT_ROOT, "..", "pi");

// Timing and container setup
export const DEFAULT_TALKIE_USER = "default-talker";

export const SCHEDULER_POLL_INTERVAL = 15000;

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// Web API port
const rawPort = parseInt(process.env.SERVER_PORT || "", 10);
export const SERVER_PORT = Number.isNaN(rawPort) ? 3000 : rawPort;

// Define the roles for channel type
export const BOT_ROLE_INFO: Record<BotRole, BotRoleInfo> = {
  "app-assistant": {
    name: "app-assistant",
    displayName: "应用助手",
    description: "支持文件操作、任务调度等功能的应用级助手",
  },
  assistant: {
    name: "assistant",
    displayName: "对话助手",
    description: "通用对话助手，网页默认角色，支持多轮对话和文件发送",
  },
  talker: {
    name: "talker",
    displayName: "对讲助手",
    description: "快速问答和对讲，适合语音助手使用",
  },
};

export const CHANNEL_ROLES: Record<BotChannel, BotRole[]> = {
  web: ["assistant", "talker"],
  weixin: ["app-assistant"],
  talkie: ["talker"],
};

export function toHostPath(containerPath: string): string {
  const rel = path.relative(STORE_DIR, containerPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path "${containerPath}" is outside store directory`);
  }
  return path.resolve(HOST_STORE_DIR, rel);
}

export function toUserFolder(userId: string, channel: BotChannel): string {
  const hash = crypto
    .createHash("sha256")
    .update(userId)
    .digest("hex")
    .slice(0, 8);
  return path.resolve(DATA_DIR, `${channel}-${hash}`);
}

export function createBotID(userId: string, role: BotRole): string {
  return `${role}-${userId}`;
}
