/**
 * Container Runner for VT-Claw
 * Spawns agent execution in containers and handles IPC
 */
import { ChildProcess, exec, spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";

import {
  CONTAINER_IMAGE,
  CONTAINER_NAME_PREFIX,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  IDLE_TIMEOUT,
  TIMEZONE,
  OUTPUT_START_MARKER,
  OUTPUT_END_MARKER,
  JID_ENV_NAME,
  FOLDER_ENV_NAME,
} from "./config.js";
import { readContainerEnvFile } from "./env.js";
import { resolveGroupFolderPath, resolveGroupIpcPath } from "./group.js";
import { logger } from "./logger.js";
import { Channel } from "./types.js";

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = "docker";

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return ["-v", `${hostPath}:${containerPath}:ro`];
}

/** Returns the shell command to stop a container by name. */
export function stopContainer(name: string): string {
  return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  try {
    execSync(`${CONTAINER_RUNTIME_BIN} info`, {
      stdio: "pipe",
      timeout: 10000,
    });
    logger.debug("Container runtime already running");
  } catch (err) {
    logger.error({ err }, "Failed to reach container runtime");
    console.error(
      "\n╔════════════════════════════════════════════════════════════════╗",
    );
    console.error(
      "║  FATAL: Container runtime failed to start                      ║",
    );
    console.error(
      "║                                                                ║",
    );
    console.error(
      "║  Agents cannot run without a container runtime. To fix:        ║",
    );
    console.error(
      "║  1. Ensure Docker is installed and running                     ║",
    );
    console.error(
      "║  2. Run: docker info                                           ║",
    );
    console.error(
      "║  3. Restart vt-claw                                           ║",
    );
    console.error(
      "╚════════════════════════════════════════════════════════════════╝\n",
    );
    throw new Error("Container runtime is required but failed to start");
  }
}

/** Kill orphaned vt-claw containers from previous runs. */
export function cleanupOrphans(): void {
  try {
    const output = execSync(
      `${CONTAINER_RUNTIME_BIN} ps --filter name=${CONTAINER_NAME_PREFIX} --format '{{.Names}}'`,
      { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" },
    );
    const orphans = output.trim().split("\n").filter(Boolean);
    for (const name of orphans) {
      try {
        execSync(stopContainer(name), { stdio: "pipe" });
      } catch {
        /* already stopped */
      }
    }
    if (orphans.length > 0) {
      logger.info(
        { count: orphans.length, names: orphans },
        "Stopped orphaned containers",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Failed to clean up orphaned containers");
  }
}

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isScheduledTask?: boolean;
}

export interface ContainerOutput {
  status: "success" | "error";
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

function buildVolumeMounts(targetChannel: Channel): VolumeMount[] {
  const mounts: VolumeMount[] = [];

  const groupDir = resolveGroupFolderPath(targetChannel.folder);
  mounts.push({
    hostPath: groupDir,
    containerPath: "/workspace/group",
    readonly: false,
  });

  const groupPiDst = path.join(
    DATA_DIR,
    "sessions",
    targetChannel.folder,
    ".pi",
  );
  mounts.push({
    hostPath: groupPiDst,
    containerPath: "/home/node/.pi",
    readonly: false,
  });

  const groupIpcDir = resolveGroupIpcPath(targetChannel.folder);
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: "/workspace/ipc",
    readonly: false,
  });

  const groupAgentRunnerDir = path.join(
    DATA_DIR,
    "sessions",
    targetChannel.folder,
    "agent-runner-src",
  );
  mounts.push({
    hostPath: groupAgentRunnerDir,
    containerPath: "/app/src",
    readonly: false,
  });

  return mounts;
}

function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
  channel: Channel,
): string[] {
  const args: string[] = ["run", "-i", "--network", "host", "--rm", "--name", containerName];

  // Pass host timezone so container's local time matches the user's
  args.push("-e", `TZ=${TIMEZONE}`);

  // Pass environment variables from .env_container file
  const containerEnv = readContainerEnvFile();
  for (const [key, value] of Object.entries(containerEnv)) {
    args.push("-e", `${key}=${value}`);
  }

  // Pass ChatJID and Folder
  args.push("-e", `${JID_ENV_NAME}=${channel.jid}`);
  args.push("-e", `${FOLDER_ENV_NAME}=${channel.folder}`);

  // Run as host user so bind-mounted files are accessible.
  // Skip when running as root (uid 0), as the container's node user (uid 1000),
  // or when getuid is unavailable (native Windows without WSL).
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    args.push("--user", `${hostUid}:${hostGid}`);
    args.push("-e", "HOME=/home/node");
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push("-v", `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

export async function runContainerAgent(
  channel: Channel,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = resolveGroupFolderPath(channel.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const mounts = buildVolumeMounts(channel);
  const safeName = channel.folder.replace(/[^a-zA-Z0-9-]/g, "-");
  const containerName = `${CONTAINER_NAME_PREFIX}-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName, channel);

  logger.info(
    {
      group: channel.name,
      containerName,
      mounts: mounts.map(
        (m) =>
          `${m.hostPath} -> ${m.containerPath}${m.readonly ? " (ro)" : ""}`,
      ),
      containerArgs: containerArgs.join(" "),
    },
    "Container mount configuration",
  );

  logger.info(
    {
      group: channel.name,
      containerName,
      mountCount: mounts.length,
    },
    "Spawning container agent",
  );

  const logsDir = path.join(groupDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    const container = spawn(CONTAINER_RUNTIME_BIN, containerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    onProcess(container, containerName);
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Write input to stdio
    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    // Streaming output: parse OUTPUT_START/END marker pairs as they arrive
    let parseBuffer = "";
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    container.stdout.on("data", (data) => {
      const chunk = data.toString();

      // Always accumulate for logging
      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
          logger.warn(
            { group: channel.name, size: stdout.length },
            "Container stdout truncated due to size limit",
          );
        } else {
          stdout += chunk;
        }
      }

      // Stream-parse for output markers
      if (onOutput) {
        parseBuffer += chunk;
        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break; // Incomplete pair, wait for more data

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            // Activity detected — reset the hard timeout
            resetTimeout();
            // Call onOutput for all markers (including null results)
            // so idle timers start even for "silent" query completions.
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn(
              { group: channel.name, error: err },
              "Failed to parse streamed output chunk",
            );
          }
        }
      }
    });

    container.stderr.on("data", (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split("\n");
      for (const line of lines) {
        if (line) logger.debug({ container: channel.folder }, line);
      }
      // Don't reset timeout on stderr — SDK writes debug logs continuously.
      // Timeout only resets on actual output (OUTPUT_MARKER in stdout).
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: channel.name, size: stderr.length },
          "Container stderr truncated due to size limit",
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;
    let hadStreamingOutput = false;
    const configTimeout = CONTAINER_TIMEOUT;
    // Grace period: hard timeout must be at least IDLE_TIMEOUT + 30s so the
    // graceful _close sentinel has time to trigger before the hard kill fires.
    const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);

    const killOnTimeout = () => {
      timedOut = true;
      logger.error(
        { group: channel.name, containerName },
        "Container timeout, stopping gracefully",
      );
      exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn(
            { group: channel.name, containerName, err },
            "Graceful stop failed, force killing",
          );
          container.kill("SIGKILL");
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);

    // Reset the timeout whenever there's activity (streaming output)
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    container.on("close", (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const timeoutLog = path.join(logsDir, `container-${ts}.log`);
        fs.writeFileSync(
          timeoutLog,
          [
            `=== Container Run Log (TIMEOUT) ===`,
            `Timestamp: ${new Date().toISOString()}`,
            `Group: ${channel.name}`,
            `Container: ${containerName}`,
            `Duration: ${duration}ms`,
            `Exit Code: ${code}`,
            `Had Streaming Output: ${hadStreamingOutput}`,
          ].join("\n"),
        );

        // Timeout after output = idle cleanup, not failure.
        // The agent already sent its response; this is just the
        // container being reaped after the idle period expired.
        if (hadStreamingOutput) {
          logger.info(
            { group: channel.name, containerName, duration, code },
            "Container timed out after output (idle cleanup)",
          );
          outputChain.then(() => {
            resolve({
              status: "success",
              result: null,
              newSessionId,
            });
          });
          return;
        }

        logger.error(
          { group: channel.name, containerName, duration, code },
          "Container timed out with no output",
        );

        resolve({
          status: "error",
          result: null,
          error: `Container timed out after ${configTimeout}ms`,
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(logsDir, `container-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "trace";

      const logLines = [
        `=== Container Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${channel.name}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      const isError = code !== 0;

      if (isVerbose || isError) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Container Args ===`,
          containerArgs.join(" "),
          ``,
          `=== Mounts ===`,
          mounts
            .map(
              (m) =>
                `${m.hostPath} -> ${m.containerPath}${m.readonly ? " (ro)" : ""}`,
            )
            .join("\n"),
          ``,
          `=== Stderr${stderrTruncated ? " (TRUNCATED)" : ""} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? " (TRUNCATED)" : ""} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || "new"}`,
          ``,
          `=== Mounts ===`,
          mounts
            .map((m) => `${m.containerPath}${m.readonly ? " (ro)" : ""}`)
            .join("\n"),
          ``,
        );
      }

      fs.writeFileSync(logFile, logLines.join("\n"));
      logger.debug({ logFile, verbose: isVerbose }, "Container log written");

      if (code !== 0) {
        logger.error(
          {
            group: channel.name,
            code,
            duration,
            stderr,
            stdout,
            logFile,
          },
          "Container exited with error",
        );

        resolve({
          status: "error",
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      // Streaming mode: wait for output chain to settle, return completion marker
      if (onOutput) {
        outputChain.then(() => {
          logger.info(
            { group: channel.name, duration, newSessionId },
            "Container completed (streaming mode)",
          );
          resolve({
            status: "success",
            result: null,
            newSessionId,
          });
        });
        return;
      }

      // Legacy mode: parse the last output marker pair from accumulated stdout
      try {
        // Extract JSON between sentinel markers for robust parsing
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // Fallback: last non-empty line (backwards compatibility)
          const lines = stdout.trim().split("\n");
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: channel.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          "Container completed",
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: channel.name,
            stdout,
            stderr,
            error: err,
          },
          "Failed to parse container output",
        );

        resolve({
          status: "error",
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    container.on("error", (err) => {
      clearTimeout(timeout);
      logger.error(
        { group: channel.name, containerName, error: err },
        "Container spawn error",
      );
      resolve({
        status: "error",
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}
