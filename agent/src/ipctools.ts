import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import fs from "fs";
import path from "path";
import { CronExpressionParser } from "cron-parser";

const IPC_DIR = "/workspace/ipc";
const MESSAGES_DIR = path.join(IPC_DIR, "messages");
const TASKS_DIR = path.join(IPC_DIR, "tasks");

const chatJid = process.env.VTCLAW_CHAT_JID!;
const groupFolder = process.env.VTCLAW_GROUP_FOLDER!;

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const sendMessageSchema = Type.Object({
  text: Type.String({
    description: "The message text to send, can't be empty.",
  }),
});

export const sendMessageTool: AgentTool<typeof sendMessageSchema> = {
  name: "send_message",
  label: "Send Message to Channel", // For UI display
  description:
    "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times.",
  parameters: sendMessageSchema,

  execute: async (
    _toolCallId: string,
    { text }: { text: string },
    _signal?: AbortSignal,
  ) => {
    const data: Record<string, string | undefined> = {
      type: "message",
      chatJid,
      text: text,
      groupFolder,
      timestamp: new Date().toISOString(),
    };
    writeIpcFile(MESSAGES_DIR, data);
    return {
      content: [{ type: "text" as const, text: "Message sent." }],
      details: undefined,
    };
  },
};

const sendFileSchema = Type.Object({
  file_path: Type.String({
    description:
      "The path to the attached file to send. Must be under `/workspace/group/` directory.",
  }),
});

export const sendFileTool: AgentTool<typeof sendFileSchema> = {
  name: "send_file",
  label: "Send file to Channel",
  description:
    "Send an file to the user or group immediately. The attached file must be located in the `/workspace/group/` directory. ",
  parameters: sendFileSchema,

  execute: async (
    _toolCallId: string,
    { file_path }: { file_path: string },
    _signal?: AbortSignal,
  ) => {
    // Resolve the absolute path
    const absolutePath = path.resolve(file_path);

    // Security check: ensure path is under /workspace/group
    const allowedDir = "/workspace/group";
    if (!absolutePath.startsWith(allowedDir) || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: File can't be found under ${allowedDir} directory. Got path: ${file_path}`,
          },
        ],
        isError: true,
        details: undefined,
      };
    }

    // Send IPC message with image path
    const data: Record<string, string | undefined> = {
      type: 'file',
      chatJid,
      file_path: absolutePath,
      groupFolder,
      timestamp: new Date().toISOString(),
    };
    console.log( JSON.stringify(data, null, 2) );
    writeIpcFile(MESSAGES_DIR, data);

    return {
      content: [{ type: "text" as const, text: "File is sent." }],
      details: undefined,
    };
  },
};

const scheduleTaskSchema = Type.Object({
  prompt: Type.String({
    description:
      "What the agent should do when the task runs. For isolated mode, include all necessary context here.",
  }),
  schedule_type: Type.Union(
    [Type.Literal("cron"), Type.Literal("interval"), Type.Literal("once")],
    {
      description:
        "cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time",
    },
  ),
  schedule_value: Type.String({
    description:
      'cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)',
  }),
});

export const scheduleTaskTool: AgentTool<typeof scheduleTaskSchema> = {
  name: "schedule_task",
  label: "Schedule Task",
  description: `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools. Returns the task ID for future reference. To modify an existing task, use update_task instead.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" → group (needs conversation context)
- "Check the weather every morning" → isolated (self-contained task)
- "Follow up on my request" → group (needs to know what was requested)
- "Generate a daily report" → isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
• Always send a message (e.g., reminders, daily briefings)
• Only send a message when there's something to report (e.g., "notify me if...")
• Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
• cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
• interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
• once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  parameters: scheduleTaskSchema,

  execute: async (
    _toolCallId: string,
    args: Static<typeof scheduleTaskSchema>,
    _signal?: AbortSignal,
  ) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === "cron") {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).`,
            },
          ],
          isError: true,
          details: undefined,
        };
      }
    } else if (args.schedule_type === "interval") {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).`,
            },
          ],
          isError: true,
          details: undefined,
        };
      }
    } else if (args.schedule_type === "once") {
      if (
        /[Zz]$/.test(args.schedule_value) ||
        /[+-]\d{2}:\d{2}$/.test(args.schedule_value)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".`,
            },
          ],
          isError: true,
          details: undefined,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".`,
            },
          ],
          isError: true,
          details: undefined,
        };
      }
    }
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const data = {
      type: "schedule_task",
      taskId,
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      targetJid: chatJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };
    writeIpcFile(TASKS_DIR, data);
    return {
      content: [
        {
          type: "text" as const,
          text: `Task ${taskId} scheduled: ${args.schedule_type} - ${args.schedule_value}`,
        },
      ],
      details: undefined,
    };
  },
};

const listTasksSchema = Type.Object({});

export const listTasksTool: AgentTool<typeof listTasksSchema> = {
  name: "list_tasks",
  label: "List Tasks",
  description: "List all scheduled tasks.",
  parameters: listTasksSchema,

  execute: async (
    _toolCallId: string,
    _args: Static<typeof listTasksSchema>,
    _signal?: AbortSignal,
  ) => {
    const tasksFile = path.join(IPC_DIR, "current_tasks.json");
    try {
      if (!fs.existsSync(tasksFile)) {
        return {
          content: [
            { type: "text" as const, text: "No scheduled tasks found." },
          ],
          details: undefined,
        };
      }
      const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
      if (tasks.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No scheduled tasks found." },
          ],
          details: undefined,
        };
      }

      const formatted = tasks
        .map(
          (t: {
            id: string;
            prompt: string;
            schedule_type: string;
            schedule_value: string;
            status: string;
            next_run: string;
          }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || "N/A"}`,
        )
        .join("\n");

      return {
        content: [
          { type: "text" as const, text: `Scheduled tasks:\n${formatted}` },
        ],
        details: undefined,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        details: undefined,
      };
    }
  },
};

const cancelTaskSchema = Type.Object({
  task_id: Type.String({ description: "The task ID to cancel" }),
});

export const cancelTaskTool: AgentTool<typeof cancelTaskSchema> = {
  name: "cancel_task",
  label: "Cancel Task",
  description: "Cancel and delete a scheduled task.",
  parameters: cancelTaskSchema,

  execute: async (
    _toolCallId: string,
    args: Static<typeof cancelTaskSchema>,
    _signal?: AbortSignal,
  ) => {
    const data = {
      type: "cancel_task",
      taskId: args.task_id,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: "text" as const,
          text: `Task ${args.task_id} cancellation requested.`,
        },
      ],
      details: undefined,
    };
  },
};
