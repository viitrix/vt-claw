export type BotChannel = "web" | "weixin" | "talkie";
export type BotRole = "app-assistant" | "assistant" | "talker";

export interface BotRecord {
  botId: string;
  userId: string;
  channel: BotChannel;
  role: BotRole;
  folder: string;
  botToken: string;
  sessionId: string;
  boundAt: string;
}

export interface ScheduledTask {
  id: string;
  bot_id: string;
  prompt: string;
  schedule_type: "cron" | "interval" | "once";
  schedule_value: string;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: "active" | "paused" | "completed";
  created_at: string;
}

export interface BotRoleInfo {
  name: BotRole;
  displayName: string;
  description: string;
}

export interface BotDeps {
  getFolder(): string;
  getBotId(): string;
  sendMessage(text: string): Promise<void>;
  sendFile(fpath: string): Promise<void>;
}
