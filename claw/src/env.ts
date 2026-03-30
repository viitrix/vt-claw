import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import { ENV_FILE, CONTAINER_ENV_FILE } from "./config.js";

/**
 * Parse the .env file and return values for the requested keys.
 * Does NOT load anything into process.env — callers decide what to
 * do with the values. This keeps secrets out of the process environment
 * so they don't leak to child processes.
 */
export function readEnvFile(keys: string[]): Record<string, string> {
  const envFile = ENV_FILE;
  let content: string;
  try {
    content = fs.readFileSync(envFile, "utf-8");
  } catch (err) {
    logger.debug({ err }, ".env file not found, using defaults");
    return {};
  }

  const result: Record<string, string> = {};
  const wanted = new Set(keys);

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!wanted.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }

  return result;
}

/**
 * Parse the .env_container file and return all key-value pairs.
 * This file is used to set environment variables inside the container.
 * Unlike readEnvFile, this returns ALL variables (no allowlist filtering).
 */
export function readContainerEnvFile(): Record<string, string> {
  const envFile = CONTAINER_ENV_FILE;
  let content: string;
  try {
    content = fs.readFileSync(envFile, "utf-8");
  } catch (err) {
    logger.debug({ err }, ".env_container file not found, skipping");
    return {};
  }

  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!key) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }

  logger.debug(
    { count: Object.keys(result).length, keys: Object.keys(result) },
    "Loaded container environment variables",
  );

  return result;
}
