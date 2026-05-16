import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  AgentSession,
} from "@mariozechner/pi-coding-agent";

import { logger } from "../logger.js";
import { BotDeps, BotRole } from "../types.js";
import { SESSION_DIR, PI_DIR } from "../config.js";
import { buildSystemPrompt } from "./prompt.js";
import {
  createSendMessageTool,
  createSendFileTool,
  createScheduleTaskTool,
  createListTaskTool,
  createCancelTaskTool,
} from "./tools.js";

async function loadOrCreateSession(sessionId: string): Promise<SessionManager> {
  if (sessionId) {
    const sessions = await SessionManager.list(process.cwd(), SESSION_DIR);
    const existingSession = sessions.find(
      (s) => s.id === sessionId || s.path.includes(sessionId),
    );

    if (existingSession) {
      logger.info(
        `Resuming existing session: ${existingSession.id.slice(0, 8)}...`,
      );
      return SessionManager.open(existingSession.path);
    } else {
      logger.info(
        `Session ${sessionId.slice(0, 8)}... not found, creating new session`,
      );
    }
  } else {
    logger.info("Creating new persistent session");
  }
  return SessionManager.create(process.cwd(), SESSION_DIR);
}

export async function createAppAssistantAgent(
  sessionId: string,
  deps: BotDeps,
): Promise<{ session: AgentSession; sessionManager: SessionManager }> {
  const sessionManager = await loadOrCreateSession(sessionId);
  const prompt = buildSystemPrompt({ __WORK_DIR__: deps.getFolder() });

  const resLoader = new DefaultResourceLoader({
    systemPromptOverride: () => prompt,
    agentDir: PI_DIR, // 加载 AGENTS.md，SKILLS, 扩展等等
    cwd: deps.getFolder(),
  });
  await resLoader.reload();

  logger.info("Creating APP AgentSession......");
  const { session } = await createAgentSession({
    sessionManager: sessionManager,
    customTools: [
      createSendMessageTool(deps),
      createSendFileTool(deps),
      createScheduleTaskTool(deps),
      createListTaskTool(deps),
      createCancelTaskTool(deps),
    ],
    resourceLoader: resLoader,
    agentDir: PI_DIR,
    cwd: deps.getFolder(),
  });
  session.setThinkingLevel("off");
  logger.info("Created Weixin AgentSession.");

  return { session, sessionManager };
}

export async function createAssistantAgent(
  sessionId: string,
  deps: BotDeps,
): Promise<{ session: AgentSession; sessionManager: SessionManager }> {
  const sessionManager = await loadOrCreateSession(sessionId);
  const prompt = buildSystemPrompt({ __WORK_DIR__: deps.getFolder() });

  const resLoader = new DefaultResourceLoader({
    systemPromptOverride: () => prompt,
    agentDir: PI_DIR,
    cwd: deps.getFolder(),
  });
  await resLoader.reload();

  logger.info("Creating Assistant AgentSession......");
  const { session } = await createAgentSession({
    sessionManager: sessionManager,
    customTools: [createSendFileTool(deps)],
    resourceLoader: resLoader,
    agentDir: PI_DIR,
    cwd: deps.getFolder(),
  });
  session.setThinkingLevel("off");
  logger.info("Created Assistant AgentSession.");

  return { session, sessionManager };
}

export async function createTalkerAgent(
  sessionId: string,
  deps: BotDeps,
): Promise<{ session: AgentSession; sessionManager: SessionManager }> {
  const sessionManager = await loadOrCreateSession(sessionId);
  const prompt = buildSystemPrompt({ __WORK_DIR__: deps.getFolder() });

  const resLoader = new DefaultResourceLoader({
    systemPromptOverride: () => prompt,
    agentDir: PI_DIR,
    cwd: deps.getFolder(),
  });
  await resLoader.reload();

  logger.info("Creating Talker AgentSession......");
  const { session } = await createAgentSession({
    sessionManager: sessionManager,
    customTools: [],
    resourceLoader: resLoader,
    agentDir: PI_DIR,
    cwd: deps.getFolder(),
  });
  session.setThinkingLevel("off");
  logger.info("Created Talker AgentSession.");

  return { session, sessionManager };
}

export const createSessionByRole: Record<
  BotRole,
  (
    sessionId: string,
    deps: BotDeps,
  ) => Promise<{ session: AgentSession; sessionManager: SessionManager }>
> = {
  "app-assistant": createAppAssistantAgent,
  assistant: createAssistantAgent,
  talker: createTalkerAgent,
};
