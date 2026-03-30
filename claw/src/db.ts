import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { NewMessage, ScheduledTask } from "./types.js";
import { STORE_DIR } from "./config.js";
import { logger } from "./logger.js";

let db: Database.Database;

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      jid TEXT,
      role TEXT,
      type TEXT,
      content TEXT,
      timestamp TEXT,
      PRIMARY KEY (id, jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      jid TEXT NOT NULL,
      group_folder TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

  `);
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, "messages.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, jid, role, type, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(msg.id, msg.jid, msg.role, msg.type, msg.content, msg.timestamp);
}

export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  limit: number = 200,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => "?").join(",");

  const sql = `
    SELECT * FROM (
      SELECT id, jid, role, type, content, timestamp
      FROM messages
      WHERE timestamp > ? AND jid IN (${placeholders})
        AND content != '' AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, limit) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  limit: number = 200,
): NewMessage[] {
  // Subquery takes the N most recent, outer query re-sorts chronologically.
  const sql = `
    SELECT * FROM (
      SELECT id, jid, role, type, content, timestamp
      FROM messages
      WHERE jid = ? AND timestamp > ?
        AND content != '' AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;
  return db.prepare(sql).all(chatJid, sinceTimestamp, limit) as NewMessage[];
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM router_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)",
  ).run(key, value);
}

// --- Tasks accessors ---

export function createTask(
  task: Omit<ScheduledTask, "last_run" | "last_result">,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, jid, prompt, schedule_type, schedule_value, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.jid,
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

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      "SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC",
    )
    .all(groupFolder) as ScheduledTask[];
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

export function getDueTasks(jids: string[]): ScheduledTask[] {
  const placeholders = jids.map(() => "?").join(",");
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND jid IN (${placeholders}) AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(...jids, now) as ScheduledTask[];
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
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}
