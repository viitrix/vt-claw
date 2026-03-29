import fs from "fs";
import path from "path";

import { logger } from "./logger.js";
import { TIMEZONE } from "./config.js";
import { NewMessage, Channel, ChannelOpts, ChannelRuntime } from "./types.js";
import { buildChannels, connectChannels } from "./channel.js";
import {
  initDatabase,
  getRouterState,
  setRouterState,
  storeMessage,
  getMessagesSince,
  getAllTasks,
} from "./db.js";
import { startMessageLoop, formatMessages, formatOutbound } from "./message.js";
import { GroupQueue, buildGroups, writeTasksSnapshot } from "./group.js";
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
  runContainerAgent,
  ContainerInput,
  ContainerOutput,
} from "./container.js";
import { startIpcWatcher } from "./ipc.js";
import { startSchedulerLoop } from "./task.js";

// 全局变量以及处理入口
const groupQueue = new GroupQueue();
const runtime: ChannelRuntime = {
  lastTimestamp: "",
  lastAgentTimestamp: {},
  sessionIDs: {},
  channels: [],
  loadState: () => {
    runtime.lastTimestamp = getRouterState("last_timestamp") || "";
    const agentTs = getRouterState("last_agent_timestamp");
    try {
      runtime.lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
    } catch {
      logger.warn("Corrupted last_agent_timestamp in DB, resetting");
      runtime.lastAgentTimestamp = {};
    }
    const agentId = getRouterState("session_id");
    try {
      runtime.sessionIDs = agentId ? JSON.parse(agentId) : {};
    } catch {
      logger.warn("Corrupted sessionID in DB, resetting");
      runtime.sessionIDs = {};
    }
  },
  saveState: () => {
    setRouterState("last_timestamp", runtime.lastTimestamp);
    setRouterState(
      "last_agent_timestamp",
      JSON.stringify(runtime.lastAgentTimestamp),
    );
    setRouterState("session_id", JSON.stringify(runtime.sessionIDs));
  },
  findChannel: (jid: string) => {
    for (const ch of runtime.channels) {
      if (ch.jid === jid) {
        return ch;
      }
    }
    return null;
  },
  findChannelByFolder: (folder: string) => {
    for (const ch of runtime.channels) {
      if (ch.folder === folder) {
        return ch;
      }
    }
    return null;
  },
};

// Message entry and loop
const channelOpts: ChannelOpts = {
  onMessage: (jid: string, message: NewMessage) => {
    if (runtime.findChannel(jid)) {
      storeMessage(message);
    }
  },
};

async function runAgentInContainer(
  targetChannel: Channel,
  prompt: string,
): Promise<[boolean, boolean]> {
  // 1. Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    targetChannel.folder,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // 2. Prepare input
  const sessionId = runtime.sessionIDs[targetChannel.jid];
  const input: ContainerInput = {
    prompt: prompt,
    sessionId: sessionId,
    groupFolder: targetChannel.folder,
    chatJid: targetChannel.jid,
  };
  let outputSentToUser = false;
  let hadError = false;

  // 3. Executing docker cli
  try {
    const output = await runContainerAgent(
      targetChannel,
      input,
      (proc, containerName) =>
        groupQueue.registerProcess(
          targetChannel.jid,
          proc,
          containerName,
          targetChannel.folder,
        ),
      async (result: ContainerOutput) => {
        // Streaming output callback — called for each agent result
        if (result.result) {
          const raw =
            typeof result.result === "string"
              ? result.result
              : JSON.stringify(result.result);
          // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
          const text = raw
            .replace(/<internal>[\s\S]*?<\/internal>/g, "")
            .trim();
          logger.info(
            { group: targetChannel.name },
            `Agent output: ${raw.slice(0, 200)}`,
          );
          if (text) {
            await targetChannel.sendMessage("text", text);
            outputSentToUser = true;
          }
        }
        if (result.status === "success") {
          groupQueue.notifyIdle(targetChannel.jid);
        }
        if (result.status === "error") {
          hadError = true;
        }
      },
    );

    if (output.newSessionId) {
      runtime.sessionIDs[targetChannel.jid] = output.newSessionId;
      runtime.saveState();
    }

    if (output.status === "error" || hadError) {
      logger.error(
        { group: targetChannel.name, error: output.error },
        "Container agent error",
      );
      return [false, outputSentToUser];
    }
    return [true, outputSentToUser];
  } catch (err) {
    logger.error({ group: targetChannel.name, err }, "Agent error");
    return [false, outputSentToUser];
  }
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const targetChannel = runtime.findChannel(chatJid);
  if (targetChannel === null) {
    logger.error(`JID: ${chatJid} can't been found in channels.`);
    return false;
  }
  const sinceTimestamp = runtime.lastAgentTimestamp[chatJid] || "";
  const missedMessages = getMessagesSince(chatJid, sinceTimestamp);
  if (missedMessages.length === 0) return true;

  const prompt = formatMessages(missedMessages, TIMEZONE);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = runtime.lastAgentTimestamp[chatJid] || "";
  runtime.lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  runtime.saveState();

  logger.info(
    { group: targetChannel.name, messageCount: missedMessages.length },
    "Processing messages",
  );

  await targetChannel.setTyping?.(true);
  const [isSuccess, hasOutput] = await runAgentInContainer(
    targetChannel,
    prompt,
  );
  await targetChannel.setTyping?.(false);

  if (isSuccess) {
    return true;
  }

  // If we already sent output to the user, don't roll back the cursor —
  // the user got their response and re-processing would send duplicates.
  if (hasOutput) {
    logger.warn(
      { group: targetChannel.name },
      "Agent error after output was sent, skipping cursor rollback to prevent duplicates",
    );
    return true;
  }
  // Roll back cursor so retries can re-process these messages
  runtime.lastAgentTimestamp[chatJid] = previousCursor;
  runtime.saveState();
  logger.warn(
    { group: targetChannel.name },
    "Agent error, rolled back message cursor for retry",
  );
  return false;
}

async function main(): Promise<void> {
  // Make sure we have container run time.
  ensureContainerRuntimeRunning();
  cleanupOrphans();

  // init database for chat messages
  initDatabase();
  runtime.loadState();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // 设置好处理消息的函数
  // Group = Channel + Container
  await buildChannels(runtime, channelOpts);
  await buildGroups(runtime);
  await connectChannels(runtime);
  if (runtime.channels.length === 0) {
    logger.fatal("No channels connected");
    process.exit(1);
  }

  // 启动 IPC 监听，Group对应的消息
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = runtime.findChannel(jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage("text", text);
    },
    sendImage: (jid, imagePath) => {
      const channel = runtime.findChannel(jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      console.log(">>>>>>>>>>>>> Send Image: " + imagePath);
      return channel.sendMessage("image", imagePath);
    },
    runtime: runtime,
  });

  // 启动 corn 定时任务监听
  startSchedulerLoop({
    runtime: runtime,
    queue: groupQueue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      groupQueue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = runtime.findChannel(jid);
      if (!channel) {
        logger.warn({ jid }, "No channel owns JID, cannot send message");
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage("text", text);
    },
  });

  groupQueue.setProcessMessagesFn(processGroupMessages);
  startMessageLoop(runtime, groupQueue).catch((err: Error) => {
    logger.fatal({ err }, "Message loop crashed unexpectedly");
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, "Failed to start vt-claw");
    process.exit(1);
  });
}
