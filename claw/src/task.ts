import { ChildProcess } from "child_process";
import { CronExpressionParser } from "cron-parser";
import fs from "fs";

import { SCHEDULER_POLL_INTERVAL, TIMEZONE } from "./config.js";
import {
  createTask,
  deleteTask,
  getDueTasks,
  getTaskById,
  updateTask,
  updateTaskAfterRun,
  getAllBotIds,
} from "./db.js";
import { logger } from "./logger.js";
import { ScheduledTask } from "./types.js";
import { scheduleBot } from "./bots/index.js";

/**
 * Compute the next run time for a recurring task, anchored to the
 * task's scheduled time rather than Date.now() to prevent cumulative
 * drift on interval-based tasks.
 *
 * Co-authored-by: @community-pr-601
 */
export function computeNextRun(task: ScheduledTask): string | null {
  if (task.schedule_type === "once") return null;

  const now = Date.now();

  if (task.schedule_type === "cron") {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    return interval.next().toISOString();
  }

  if (task.schedule_type === "interval") {
    const ms = parseInt(task.schedule_value, 10);
    if (!ms || ms <= 0) {
      // Guard against malformed interval that would cause an infinite loop
      logger.warn(
        { taskId: task.id, value: task.schedule_value },
        "Invalid interval value",
      );
      return new Date(now + 60_000).toISOString();
    }
    // Anchor to the scheduled time, not now, to prevent drift.
    // Skip past any missed intervals so we always land in the future.
    let next = new Date(task.next_run!).getTime() + ms;
    while (next <= now) {
      next += ms;
    }
    return new Date(next).toISOString();
  }

  return null;
}

async function runTask(task: ScheduledTask): Promise<void> {
  logger.info({ taskId: task.id }, "Running scheduled task");

  await scheduleBot(task.bot_id, task.prompt);

  const nextRun = computeNextRun(task);
  const resultSummary = "Task is Done";
  updateTaskAfterRun(task.id, nextRun, resultSummary);
}

let schedulerRunning = false;

export function startSchedulerLoop(): void {
  if (schedulerRunning) {
    logger.debug("Scheduler loop already running, skipping duplicate start");
    return;
  }
  schedulerRunning = true;
  logger.info("Scheduler loop started");

  const loop = async () => {
    const botIds = getAllBotIds();
    try {
      const dueTasks = getDueTasks(botIds);
      if (dueTasks.length > 0) {
        logger.info({ count: dueTasks.length }, "Found due tasks");
      }

      for (const task of dueTasks) {
        // Re-check task status in case it was paused/cancelled
        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== "active") {
          continue;
        }
        updateTask(currentTask.id, { status: "paused" });
        void runTask(currentTask);
      }
    } catch (err) {
      logger.error({ err }, "Error in scheduler loop");
    }
    setTimeout(loop, SCHEDULER_POLL_INTERVAL);
  };

  loop();
}

/** @internal - for tests only. */
export function _resetSchedulerLoopForTests(): void {
  schedulerRunning = false;
}

export async function processTask(data: {
  type: string;
  botId: string;
  taskId?: string;
  prompt?: string;
  schedule_type?: string;
  schedule_value?: string;
}): Promise<void> {
  logger.info(data, "Task IPC data");
  switch (data.type) {
    case "schedule_task":
      if (data.prompt && data.schedule_type && data.schedule_value) {
        const scheduleType = data.schedule_type as "cron" | "interval" | "once";

        let nextRun: string | null = null;
        if (scheduleType === "cron") {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              "Invalid cron expression",
            );
            break;
          }
        } else if (scheduleType === "interval") {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              "Invalid interval",
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === "once") {
          const date = new Date(data.schedule_value);
          if (isNaN(date.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              "Invalid timestamp",
            );
            break;
          }
          nextRun = date.toISOString();
        }

        const taskId =
          data.taskId ||
          `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        createTask({
          id: taskId,
          bot_id: data.botId,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          next_run: nextRun,
          status: "active",
          created_at: new Date().toISOString(),
        });

        logger.info({ taskId }, "Task created via IPC");
      } else {
        logger.error(data, "schedule_task json data error");
      }
      break;

    case "cancel_task":
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task) {
          deleteTask(data.taskId);
          logger.info({ taskId: data.taskId }, "Task cancelled via IPC");
        } else {
          logger.warn(
            { taskId: data.taskId },
            "Unauthorized task cancel attempt",
          );
        }
      }
      break;

    default:
      logger.warn({ type: data.type }, "Unknown IPC task type");
  }
}
