import { ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import {
  DATA_DIR,
  GROUPS_DIR,
  PI_DIR,
  MAX_CONCURRENT_CONTAINERS,
} from "./config.js";
import { ChannelRuntime, Channel } from "./types.js";
import { readEnvFile } from "./env.js";
import { logger } from "./logger.js";

const GROUP_FOLDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RESERVED_FOLDERS = new Set(["global"]);

// Group = channel + container
interface QueuedTask {
  id: string;
  groupJid: string;
  fn: () => Promise<void>;
}
interface GroupState {
  // Group's state
  active: boolean;
  idleWaiting: boolean;
  isTaskContainer: boolean;

  // Group's data
  runningTaskId: string | null;
  pendingMessages: boolean;
  pendingTasks: QueuedTask[];
  process: ChildProcess | null;
  containerName: string | null;
  groupFolder: string | null;
  retryCount: number;
}

const MAX_RETRIES = 5;
const BASE_RETRY_MS = 5000;

export class GroupQueue {
  private groups = new Map<string, GroupState>();
  private activeCount = 0;
  private waitingGroups: string[] = [];
  private shuttingDown = false;

  // Actual function for processing all pending messages.
  private processMessagesFn: ((groupJid: string) => Promise<boolean>) | null =
    null;

  private getGroup(groupJid: string): GroupState {
    let state = this.groups.get(groupJid);
    if (!state) {
      // Init Groups's state and data
      state = {
        active: false,
        idleWaiting: false,
        isTaskContainer: false,
        runningTaskId: null,
        pendingMessages: false,
        pendingTasks: [],
        process: null,
        containerName: null,
        groupFolder: null,
        retryCount: 0,
      };
      this.groups.set(groupJid, state);
    }
    return state;
  }

  setProcessMessagesFn(fn: (groupJid: string) => Promise<boolean>): void {
    this.processMessagesFn = fn;
  }

  enqueueMessageCheck(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    if (state.active) {
      state.pendingMessages = true;
      logger.debug({ groupJid }, "Container active, message queued");
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingMessages = true;
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.debug(
        { groupJid, activeCount: this.activeCount },
        "At concurrency limit, message queued",
      );
      return;
    }
    // Try to run processMessageFn
    this.runForGroup(groupJid, "messages").catch((err) =>
      logger.error({ groupJid, err }, "Unhandled error in runForGroup"),
    );
  }

  enqueueTask(groupJid: string, taskId: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Prevent double-queuing: check both pending and currently-running task
    if (state.runningTaskId === taskId) {
      logger.debug({ groupJid, taskId }, "Task already running, skipping");
      return;
    }
    if (state.pendingTasks.some((t) => t.id === taskId)) {
      logger.debug({ groupJid, taskId }, "Task already queued, skipping");
      return;
    }

    if (state.active) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (state.idleWaiting) {
        this.closeStdin(groupJid);
      }
      logger.debug({ groupJid, taskId }, "Container active, task queued");
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.debug(
        { groupJid, taskId, activeCount: this.activeCount },
        "At concurrency limit, task queued",
      );
      return;
    }

    // Run immediately
    this.runTask(groupJid, { id: taskId, groupJid, fn }).catch((err) =>
      logger.error({ groupJid, taskId, err }, "Unhandled error in runTask"),
    );
  }

  registerProcess(
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder: string,
  ): void {
    const state = this.getGroup(groupJid);
    state.process = proc;
    state.containerName = containerName;
    state.groupFolder = groupFolder;
  }

  /**
   * Mark the container as idle-waiting (finished work, waiting for IPC input).
   * If tasks are pending, preempt the idle container immediately.
   */
  notifyIdle(groupJid: string): void {
    const state = this.getGroup(groupJid);
    state.idleWaiting = true;
    if (state.pendingTasks.length > 0) {
      this.closeStdin(groupJid);
    }
  }

  /**
   * Send a follow-up message to the active container via IPC file.
   * Returns true if the message was written, false if no active container.
   */
  sendMessage(groupJid: string, text: string): boolean {
    const state = this.getGroup(groupJid);
    if (!state.active || !state.groupFolder || state.isTaskContainer)
      return false;
    state.idleWaiting = false; // Agent is about to receive work, no longer idle

    const inputDir = path.join(DATA_DIR, "ipc", state.groupFolder, "input");
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
      const filepath = path.join(inputDir, filename);
      const tempPath = `${filepath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify({ type: "message", text }));
      fs.renameSync(tempPath, filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Signal the active container to wind down by writing a close sentinel.
   */
  closeStdin(groupJid: string): void {
    const state = this.getGroup(groupJid);
    if (!state.active || !state.groupFolder) return;

    const inputDir = path.join(DATA_DIR, "ipc", state.groupFolder, "input");
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, "_close"), "");
    } catch {
      // ignore
    }
  }

  private async runForGroup(
    groupJid: string,
    reason: "messages" | "drain",
  ): Promise<void> {
    const state = this.getGroup(groupJid);
    state.active = true;
    state.idleWaiting = false;
    state.isTaskContainer = false;
    state.pendingMessages = false;
    this.activeCount++;

    logger.info(
      { groupJid, reason, activeCount: this.activeCount },
      "Starting container for group",
    );

    try {
      if (this.processMessagesFn) {
        const success = await this.processMessagesFn(groupJid);
        if (success) {
          state.retryCount = 0;
        } else {
          this.scheduleRetry(groupJid, state);
        }
      }
    } catch (err) {
      logger.error({ groupJid, err }, "Error processing messages for group");
      this.scheduleRetry(groupJid, state);
    } finally {
      state.active = false;
      state.process = null;
      state.containerName = null;
      state.groupFolder = null;
      this.activeCount--;
      this.drainGroup(groupJid);
    }
  }

  private async runTask(groupJid: string, task: QueuedTask): Promise<void> {
    const state = this.getGroup(groupJid);
    state.active = true;
    state.idleWaiting = false;
    state.isTaskContainer = true;
    state.runningTaskId = task.id;
    this.activeCount++;

    logger.debug(
      { groupJid, taskId: task.id, activeCount: this.activeCount },
      "Running queued task",
    );

    try {
      await task.fn();
    } catch (err) {
      logger.error({ groupJid, taskId: task.id, err }, "Error running task");
    } finally {
      state.active = false;
      state.isTaskContainer = false;
      state.runningTaskId = null;
      state.process = null;
      state.containerName = null;
      state.groupFolder = null;
      this.activeCount--;
      this.drainGroup(groupJid);
    }
  }

  private scheduleRetry(groupJid: string, state: GroupState): void {
    state.retryCount++;
    if (state.retryCount > MAX_RETRIES) {
      logger.error(
        { groupJid, retryCount: state.retryCount },
        "Max retries exceeded, dropping messages (will retry on next incoming message)",
      );
      state.retryCount = 0;
      return;
    }

    const delayMs = BASE_RETRY_MS * Math.pow(2, state.retryCount - 1);
    logger.info(
      { groupJid, retryCount: state.retryCount, delayMs },
      "Scheduling retry with backoff",
    );
    setTimeout(() => {
      if (!this.shuttingDown) {
        this.enqueueMessageCheck(groupJid);
      }
    }, delayMs);
  }

  private drainGroup(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Tasks first (they won't be re-discovered from SQLite like messages)
    if (state.pendingTasks.length > 0) {
      const task = state.pendingTasks.shift()!;
      this.runTask(groupJid, task).catch((err) =>
        logger.error(
          { groupJid, taskId: task.id, err },
          "Unhandled error in runTask (drain)",
        ),
      );
      return;
    }

    // Then pending messages
    if (state.pendingMessages) {
      this.runForGroup(groupJid, "drain").catch((err) =>
        logger.error(
          { groupJid, err },
          "Unhandled error in runForGroup (drain)",
        ),
      );
      return;
    }

    // Nothing pending for this group; check if other groups are waiting for a slot
    this.drainWaiting();
  }

  private drainWaiting(): void {
    while (
      this.waitingGroups.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const nextJid = this.waitingGroups.shift()!;
      const state = this.getGroup(nextJid);

      // Prioritize tasks over messages
      if (state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(nextJid, task).catch((err) =>
          logger.error(
            { groupJid: nextJid, taskId: task.id, err },
            "Unhandled error in runTask (waiting)",
          ),
        );
      } else if (state.pendingMessages) {
        this.runForGroup(nextJid, "drain").catch((err) =>
          logger.error(
            { groupJid: nextJid, err },
            "Unhandled error in runForGroup (waiting)",
          ),
        );
      }
      // If neither pending, skip this group
    }
  }

  async shutdown(_gracePeriodMs: number): Promise<void> {
    this.shuttingDown = true;

    // Count active containers but don't kill them — they'll finish on their own
    // via idle timeout or container timeout. The --rm flag cleans them up on exit.
    // This prevents WhatsApp reconnection restarts from killing working agents.
    const activeContainers: string[] = [];
    for (const [jid, state] of this.groups) {
      if (state.process && !state.process.killed && state.containerName) {
        activeContainers.push(state.containerName);
      }
    }

    logger.info(
      { activeCount: this.activeCount, detachedContainers: activeContainers },
      "GroupQueue shutting down (containers detached, not killed)",
    );
  }
}

// Folders for group
function ensureWithinBase(baseDir: string, resolvedPath: string): void {
  const rel = path.relative(baseDir, resolvedPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes base directory: ${resolvedPath}`);
  }
}
export function isValidGroupFolder(folder: string): boolean {
  if (!folder) return false;
  if (folder !== folder.trim()) return false;
  if (!GROUP_FOLDER_PATTERN.test(folder)) return false;
  if (folder.includes("/") || folder.includes("\\")) return false;
  if (folder.includes("..")) return false;
  if (RESERVED_FOLDERS.has(folder.toLowerCase())) return false;
  return true;
}
function assertValidGroupFolder(folder: string): void {
  if (!isValidGroupFolder(folder)) {
    throw new Error(`Invalid group folder "${folder}"`);
  }
}
export function resolveGroupFolderPath(folder: string): string {
  assertValidGroupFolder(folder);
  const groupPath = path.resolve(GROUPS_DIR, folder);
  ensureWithinBase(GROUPS_DIR, groupPath);
  return groupPath;
}
export function resolveGroupIpcPath(folder: string): string {
  assertValidGroupFolder(folder);
  const ipcBaseDir = path.resolve(DATA_DIR, "ipc");
  const ipcPath = path.resolve(ipcBaseDir, folder);
  ensureWithinBase(ipcBaseDir, ipcPath);
  return ipcPath;
}

// Prepare folder and data for Group
export async function buildGroups(runtime: ChannelRuntime): Promise<void> {
  for (const ch of runtime.channels) {
    if (!isValidGroupFolder(ch.folder)) {
      throw new Error(
        `Folder of channel ${ch.name} '${ch.folder}' is inValid!`,
      );
    }

    // Per-group pi sessions directory (isolated from other groups)
    // Each group gets their own .皮/ to prevent cross-group session access
    const groupPiDst = path.join(DATA_DIR, "sessions", ch.folder, ".pi");
    fs.mkdirSync(groupPiDst, { recursive: true });
    if (fs.existsSync(PI_DIR)) {
      fs.cpSync(PI_DIR, groupPiDst, { recursive: true });
    }
    // Replace apiKey fields with actual values from environment variables
    const modelFile = path.join(groupPiDst, "agent", "models.json");
    if (fs.existsSync(modelFile)) {
      const modelsConfig = JSON.parse(fs.readFileSync(modelFile, "utf-8"));

      // First pass: collect all apiKey values (env var names)
      function collectApiKeys(obj: any): void {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          for (const item of obj) collectApiKeys(item);
          return;
        }
        const record = obj as Record<string, unknown>;
        for (const key of Object.keys(record)) {
          if (key === "apiKey" && typeof record[key] === "string") {
            const ename = record[key];
            const evalue = readEnvFile([ename])[ename];
            if (!evalue) {
              throw new Error(
                `Replacing ${modelFile} : can't find ${ename} in .env`,
              );
            }
            obj[key] = evalue;
          } else {
            collectApiKeys(record[key]);
          }
        }
      }
      collectApiKeys(modelsConfig);
      fs.writeFileSync(modelFile, JSON.stringify(modelsConfig, null, 2));
    }

    // Per-group IPC namespace: each group gets its own IPC directory
    // This prevents cross-group privilege escalation via IPC
    const groupIpcDir = resolveGroupIpcPath(ch.folder);
    fs.mkdirSync(path.join(groupIpcDir, "messages"), { recursive: true });
    fs.mkdirSync(path.join(groupIpcDir, "tasks"), { recursive: true });
    fs.mkdirSync(path.join(groupIpcDir, "input"), { recursive: true });

    // Copy agent-runner source into a per-group writable location so agents
    // can customize it (add tools, change behavior) without affecting other
    // groups. Recompiled on container startup via entrypoint.sh.
    const projectRoot = process.cwd();
    const agentRunnerSrc = path.join(projectRoot, "..", "agent", "src");
    const groupAgentRunnerDir = path.join(
      DATA_DIR,
      "sessions",
      ch.folder,
      "agent-runner-src",
    );
    fs.mkdirSync(groupAgentRunnerDir, { recursive: true });
    fs.cpSync(agentRunnerSrc, groupAgentRunnerDir, { recursive: true });

    // Group(Docker + Channel) working folder
    //  logs:     container life cycle logs
    //  recevied: attached files/images from channel
    //  memory:   memory files
    const groupDir = resolveGroupFolderPath(ch.folder);
    fs.mkdirSync(groupDir, { recursive: true });
    const recvFileDir = path.join(groupDir, "received");
    fs.mkdirSync(recvFileDir, { recursive: true });
    const memFileDir = path.join(groupDir, "memory");
    fs.mkdirSync(memFileDir, { recursive: true });
    const logsDir = path.join(groupDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });
  }
}
export function receiveFileForGroup(folder: string, filePath: string): string {
  const groupDir = resolveGroupFolderPath(folder);
  const recvFileDir = path.join(groupDir, "received");

  // Ensure target directory exists
  fs.mkdirSync(recvFileDir, { recursive: true });

  const originalName = path.basename(filePath);
  const targetPath = path.join(recvFileDir, originalName);

  // Move file to received directory
  fs.renameSync(filePath, targetPath);

  // Return container path
  return `/workspace/group/received/${originalName}`;
}
export function writeTasksSnapshot(
  groupFolder: string,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the group's IPC directory
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, "current_tasks.json");
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}
