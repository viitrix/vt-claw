import { logger } from "./logger.js";
import { SERVER_PORT } from "./config.js";
import { initDatabase } from "./db.js";
import { startSchedulerLoop } from "./task.js";
import { startServer } from "./service.js";
import { startBots } from "./bots/index.js";

async function main(): Promise<void> {
  // init
  await initDatabase();
  await startBots();
  await startServer(SERVER_PORT);
  startSchedulerLoop();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start wx-pi");
  process.exit(1);
});
