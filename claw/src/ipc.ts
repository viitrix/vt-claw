import fs from "fs";
import path from "path";

import { CronExpressionParser } from "cron-parser";

import { DATA_DIR, IPC_POLL_INTERVAL, TIMEZONE } from "./config.js";
import { createTask, deleteTask, getAllTasks, getTaskById } from "./db.js";
import { writeTasksSnapshot } from "./group.js";
import { logger } from "./logger.js";
import { ChannelRuntime } from "./types.js";

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  sendImage: (jid: string, imagePath: string) => Promise<void>;
  runtime: ChannelRuntime;
}

/**
 * Convert a container path to a host path with security validation.
 *
 * @param containerPath - Path inside container (e.g., "/workspace/group/subdir/file.png")
 * @param sourceGroup - The group folder name for authorization
 * @returns Host path if valid and exists, null otherwise
 */
export function containerPathToHostPath(
  containerPath: string,
  sourceGroup: string,
): string | null {
  const containerGroupPath = "/workspace/group";

  // Validate container path format
  if (!containerPath.startsWith(containerGroupPath + "/")) {
    logger.warn(
      { containerPath, sourceGroup },
      "Invalid container path format, must start with /workspace/group/",
    );
    return null;
  }

  // Extract relative path
  const relativePath = containerPath.slice(containerGroupPath.length + 1);

  // Build host path
  const groupDir = path.join(DATA_DIR, "groups", sourceGroup);
  const hostPath = path.resolve(groupDir, relativePath);

  // Security check: ensure the resolved path is within the group directory
  const relative = path.relative(groupDir, hostPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    logger.warn(
      { containerPath, hostPath, sourceGroup },
      "Path escapes group directory, blocked",
    );
    return null;
  }

  // Check if file exists
  if (!fs.existsSync(hostPath)) {
    logger.warn({ hostPath, sourceGroup }, "File does not exist on host");
    return null;
  }

  return hostPath;
}

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug("IPC watcher already running, skipping duplicate start");
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, "ipc");
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== "errors";
      });
    } catch (err) {
      logger.error({ err }, "Error reading IPC base directory");
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const runtime = deps.runtime;
    for (const sourceGroup of groupFolders) {
      const messagesDir = path.join(ipcBaseDir, sourceGroup, "messages");
      const tasksDir = path.join(ipcBaseDir, sourceGroup, "tasks");

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith(".json"));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
              if (data.type === "message" && data.chatJid) {
                const targetGroup = runtime.findChannel(data.chatJid);
                if (targetGroup && targetGroup.folder === sourceGroup) {
                  await deps.sendMessage(data.chatJid, data.text);
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    "IPC message sent",
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    "Unauthorized IPC message attempt blocked",
                  );
                }
              }
              if (data.type === "image" && data.chatJid && data.image_path) {
                const targetGroup = runtime.findChannel(data.chatJid);
                const hostImagePath = containerPathToHostPath(
                  data.image_path,
                  sourceGroup,
                );

                if (
                  targetGroup &&
                  targetGroup.folder === sourceGroup &&
                  hostImagePath
                ) {
                  await deps.sendImage(data.chatJid, hostImagePath);
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    "IPC image sent",
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    "Unauthorized IPC image attempt blocked",
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                "Error processing IPC message",
              );
              const errorDir = path.join(ipcBaseDir, "errors");
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          "Error reading IPC messages directory",
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith(".json"));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                "Error processing IPC task",
              );
              const errorDir = path.join(ipcBaseDir, "errors");
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, "Error reading IPC tasks directory");
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info("IPC watcher started (per-group namespaces)");
}

export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
  },
  sourceGroup: string, // Verified identity from IPC directory
  deps: IpcDeps,
): Promise<void> {
  const runtime = deps.runtime;
  logger.info(data, "Task IPC data");
  switch (data.type) {
    case "schedule_task":
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = runtime.findChannel(targetJid);

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            "Cannot schedule task: target group not registered",
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            "Unauthorized schedule_task attempt blocked",
          );
          break;
        }

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
          group_folder: targetFolder,
          jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          next_run: nextRun,
          status: "active",
          created_at: new Date().toISOString(),
        });
        // Immediately update tasks snapshot so running container can see it
        writeTasksSnapshot(
          targetFolder,
          getAllTasks().map((t) => ({
            id: t.id,
            groupFolder: t.group_folder,
            prompt: t.prompt,
            schedule_type: t.schedule_type,
            schedule_value: t.schedule_value,
            status: t.status,
            next_run: t.next_run,
          })),
        );
        logger.info(
          { taskId, sourceGroup, targetFolder },
          "Task created via IPC",
        );
      } else {
        logger.error(data, "schedule_task json data error");
      }
      break;

    case "cancel_task":
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && task.group_folder === sourceGroup) {
          deleteTask(data.taskId);
          // Update tasks snapshot immediately
          writeTasksSnapshot(
            sourceGroup,
            getAllTasks().map((t) => ({
              id: t.id,
              groupFolder: t.group_folder,
              prompt: t.prompt,
              schedule_type: t.schedule_type,
              schedule_value: t.schedule_value,
              status: t.status,
              next_run: t.next_run,
            })),
          );
          logger.info(
            { taskId: data.taskId, sourceGroup },
            "Task cancelled via IPC",
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            "Unauthorized task cancel attempt",
          );
        }
      }
      break;

    default:
      logger.warn({ type: data.type }, "Unknown IPC task type");
  }
}
