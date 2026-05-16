import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { ScheduledTask, BotRecord, BotChannel, BotRole } from "./types.js";
import { createBotID, DEFAULT_TALKIE_USER, STORE_DIR } from "./config.js";
import { logger } from "./logger.js";

let db: Database.Database;

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS all_bots (
      user_id TEXT NOT NULL CHECK(user_id <> ''),
      channel TEXT NOT NULL CHECK(channel IN ('weixin', 'web', 'talkie')),
      role TEXT NOT NULL CHECK(role <> ''),
      folder TEXT NOT NULL CHECK(folder <> ''),
      session_id TEXT NOT NULL DEFAULT '',
      bot_token TEXT NOT NULL DEFAULT '',
      bound_at TEXT NOT NULL,
      PRIMARY KEY (user_id, role)
    );

    CREATE TRIGGER IF NOT EXISTS enforce_channel_consistency_insert
    BEFORE INSERT ON all_bots
    BEGIN
      SELECT RAISE(ABORT, 'channel must be the same for the same user_id')
      WHERE EXISTS (
        SELECT 1 FROM all_bots
        WHERE user_id = NEW.user_id AND channel != NEW.channel
      );
    END;

    CREATE TRIGGER IF NOT EXISTS enforce_channel_consistency_update
    BEFORE UPDATE ON all_bots
    BEGIN
      SELECT RAISE(ABORT, 'channel must be the same for the same user_id')
      WHERE EXISTS (
        SELECT 1 FROM all_bots
        WHERE user_id = NEW.user_id AND channel != NEW.channel AND role != NEW.role
      );
    END;
  `);
}

export async function initDatabase(): Promise<void> {
  const dbPath = path.join(STORE_DIR, "tasks.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  createSchema(db);

  db.prepare(
    `INSERT OR IGNORE INTO all_bots (user_id, channel, role, folder, session_id, bot_token, bound_at)
     VALUES (?, ?, ?, ?, '', '', ?)`,
  ).run(
    DEFAULT_TALKIE_USER,
    "talkie",
    "talker",
    "_",
    new Date().toISOString(),
  );
  logger.info("Database initialized at " + dbPath);
}

// --- Tasks accessors ---

export function createTask(
  task: Omit<ScheduledTask, "last_run" | "last_result">,
): void {
  db.prepare(
    `
      INSERT INTO scheduled_tasks (id, bot_id, prompt, schedule_type, schedule_value, next_run, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    task.id,
    task.bot_id,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.next_run,
    task.status,
    task.created_at,
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id) as
    | ScheduledTask
    | undefined;
}

export function getActiveTasksForBot(botId: string): ScheduledTask[] {
  return db
    .prepare(
      "SELECT * FROM scheduled_tasks WHERE bot_id = ? ORDER BY created_at DESC",
    )
    .all(botId) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC")
    .all() as ScheduledTask[];
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      "prompt" | "schedule_type" | "schedule_value" | "next_run" | "status"
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push("prompt = ?");
    values.push(updates.prompt);
  }
  if (updates.schedule_type !== undefined) {
    fields.push("schedule_type = ?");
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push("schedule_value = ?");
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push("next_run = ?");
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(", ")} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
}

export function getDueTasks(botIds: string[]): ScheduledTask[] {
  if (botIds.length === 0) return [];
  const placeholders = botIds.map(() => "?").join(",");
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND bot_id IN (${placeholders}) AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(...botIds, now) as ScheduledTask[];
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE 'active' END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

// --- AllBots accessors ---

interface BotRow {
  user_id: string;
  channel: string;
  role: string;
  folder: string;
  session_id: string;
  bot_token: string;
  bound_at: string;
}

function rowToBot(row: BotRow): BotRecord {
  return {
    botId: createBotID(row.user_id, row.role as BotRole),
    userId: row.user_id,
    channel: row.channel as BotChannel,
    role: row.role as BotRole,
    folder: row.folder,
    sessionId: row.session_id,
    botToken: row.bot_token,
    boundAt: row.bound_at,
  };
}

export function upsertBot(b: BotRecord): void {
  if (!b.folder) {
    throw new Error(`folder is required for bot ${b.userId}`);
  }
  db.prepare(
    `INSERT INTO all_bots (user_id, channel, role, folder, session_id, bot_token, bound_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, role) DO UPDATE SET
       channel = excluded.channel,
       folder = excluded.folder,
       session_id = excluded.session_id,
       bot_token = excluded.bot_token,
       bound_at = excluded.bound_at`,
  ).run(
    b.userId,
    b.channel,
    b.role,
    b.folder,
    b.sessionId,
    b.botToken,
    b.boundAt,
  );
}

export function getBotById(botId: string): BotRecord | undefined {
  const row = db
    .prepare("SELECT * FROM all_bots WHERE role || '-' || user_id = ?")
    .get(botId) as BotRow | undefined;
  return row ? rowToBot(row) : undefined;
}

export function getBot(userId: string, role: BotRole): BotRecord | undefined {
  const row = db
    .prepare("SELECT * FROM all_bots WHERE user_id = ? AND role = ?")
    .get(userId, role) as BotRow | undefined;
  return row ? rowToBot(row) : undefined;
}

export function getAllBots(): BotRecord[] {
  const rows = db
    .prepare("SELECT * FROM all_bots ORDER BY bound_at DESC")
    .all() as BotRow[];
  return rows.map(rowToBot);
}

export function getAllBotIds(): string[] {
  return db
    .prepare("SELECT role || '-' || user_id FROM all_bots")
    .pluck()
    .all() as string[];
}
