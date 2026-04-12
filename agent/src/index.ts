/**
 * Pi Coding Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF, like before)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Multiple results may be emitted (one per agent teams result).
 *   Final marker after loop ends signals completion.
 */

import fs from "fs";
import path from "path";
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  AgentSession,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import {
  sendMessageTool,
  sendFileTool,
  scheduleTaskTool,
  listTasksTool,
  cancelTaskTool,
  sendIpcMessage,
} from "./ipctools.js";
import { is } from "zod/locales";

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isScheduledTask?: boolean;
}

interface ContainerOutput {
  status: "success" | "error";
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const IPC_INPUT_DIR = "/workspace/ipc/input";
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, "_close");
const IPC_POLL_MS = 500;

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const OUTPUT_START_MARKER = "---VT-CLAW_OUTPUT_START---";
const OUTPUT_END_MARKER = "---VT-CLAW_OUTPUT_END---";

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

/**
 * Check for _close sentinel.
 */
function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try {
      fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

/**
 * Drain all pending IPC input messages.
 * Returns messages found, or empty array.
 */
function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs
      .readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        fs.unlinkSync(filePath);
        if (data.type === "message" && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(
          `Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 * Returns the messages as a single string, or null if _close.
 */
function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join("\n"));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

const SYSTEM_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files before editing. You must use this tool instead of cat or sed.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files

## Before Writing Code
  Read all relevant files first. Never edit blind.
  Understand the full requirement before writing anything.
## While Writing Code
  Test after writing. Never leave code untested.
  Fix errors before moving on. Never skip failures.
  Prefer editing over rewriting whole files.
  Simplest working solution. No over-engineering.
## Before Declaring Done
  Run the code one final time to confirm it works.
  Never declare done without a passing test.
## Added timeout parameter for bash commands with network.
  You can setup 5 minutes values for 'timeout' parameter.

`;

const btwExtention = function (pi: ExtensionAPI) {
  // Listen for events from other extensions
	pi.events.on("btw:result", (data:any) => {
    const content = data.toString();
    sendIpcMessage(content);
	});
};

/**
 * Create a session that can be reused across multiple queries.
 */
async function createSession(
  containerInput: ContainerInput,
): Promise<{ session: Awaited<ReturnType<typeof createAgentSession>>["session"]; sessionManager: SessionManager }> {
  const sessionId = containerInput.sessionId;
  let sessionManager: SessionManager;

  if (sessionId) {
    try {
      const sessions = await SessionManager.list(process.cwd());
      const existingSession = sessions.find(
        (s) => s.id === sessionId || s.path.includes(sessionId),
      );

      if (existingSession) {
        log(`Resuming existing session: ${existingSession.id.slice(0, 8)}...`);
        sessionManager = SessionManager.open(existingSession.path);
      } else {
        log(
          `Session ${sessionId.slice(0, 8)}... not found, creating new session`,
        );
        sessionManager = SessionManager.create(process.cwd());
      }
    } catch (err) {
      log(
        `Error listing sessions, creating new: ${err instanceof Error ? err.message : String(err)}`,
      );
      sessionManager = SessionManager.create(process.cwd());
    }
  } else {
    log("Creating new persistent session");
    sessionManager = SessionManager.create(process.cwd());
  }

  const extTools = [
    sendMessageTool,
    sendFileTool,
    scheduleTaskTool,
    listTasksTool,
    cancelTaskTool,
  ];
  const resLoader = new DefaultResourceLoader({
    systemPromptOverride: () => SYSTEM_PROMPT,
    extensionFactories: [
      btwExtention,
	  ],
  });
  await resLoader.reload();

  const { session } = await createAgentSession({
    sessionManager: sessionManager,
    customTools: extTools,
    resourceLoader: resLoader,
  });

  console.log(session.systemPrompt);

  session.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        break;
      case "tool_execution_start":
        log(`Tool: ${event.toolName}`);
        break;
      case "tool_execution_end":
        log(`Result: ${event.result}`);
        break;
      case "agent_end":
        log("Done");
        break;
    }
  });

  return { session, sessionManager };
}

/**
 * Run a single query on an existing session and stream results via writeOutput.
 */
function runQuery(
  prompt: string,
  session: AgentSession,
  onComplete: () => void,
): void {
  session.prompt(prompt).then(() => {    
    const newSessionId = session.sessionId;
    const last = session.state.messages.length - 1;
    const msg = session.state.messages[last];
    if (msg.role === "assistant") {
      if (msg.errorMessage) {
        writeOutput({
          status: "error",
          result: msg.errorMessage,
          newSessionId: newSessionId,
        });
      } else {
        msg.content.forEach((m) => {
          if (m.type == "text") {
            writeOutput({
              status: "success",
              result: m.text,
              newSessionId: newSessionId,
            });
          }
        });
      }
    }
    onComplete();
  });
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    // Delete the temp file the entrypoint wrote — it contains secrets
    try {
      fs.unlinkSync("/tmp/input.json");
    } catch {
      /* may not exist */
    }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: "error",
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Clean up stale _close sentinel from previous container runs
  try {
    fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
  } catch {
    /* ignore */
  }

  // Build initial prompt (drain any pending IPC messages too)
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += "\n" + pending.join("\n");
  }

  // Create session once and reuse for all queries
  const { session } = await createSession(containerInput);
  containerInput.sessionId = session.sessionId;

  // Query loop: run query → wait for IPC message → run new query → repeat
  let isBusy = false;
  try {
    while (true) {
      if (isBusy == false) {
        isBusy = true;
        log(`Starting query (session: ${session.sessionId || "new"})...`);
        runQuery(prompt, session, () => {
          // Emit session update so host can track it
          writeOutput({
            status: "success",
            result: null,
            newSessionId: session.sessionId,
          });
          isBusy = false;
          log("Query ended");
        });
      } else {
        log("Still processing previous query, steering with new prompt");
        await session.steer(prompt);
      }
      
      log(`Waitting for new IPC message...`);
      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log("Close sentinel received, exiting");
        break;
      }
      log(`Got new message (${nextMessage.length} chars).`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: "error",
      result: null,
      newSessionId: containerInput.sessionId,
      error: errorMessage,
    });
    process.exit(1);
  }
}

console.log("#### Contianer Working Folder: " + process.cwd() + " #####");
main();
