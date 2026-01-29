/**
 * Workspace path resolution for MoltBoard scripts.
 * JavaScript version for use by migration and CLI scripts.
 */

import fs from "fs";
import path from "path";
import { homedir } from "os";

const DEFAULT_WORKSPACE = path.join(homedir(), "workspace");

// Config file locations to check (in order of priority)
const CONFIG_PATHS = [
  path.join(homedir(), ".clawdbot", "clawdbot.json"), // Current location
  path.join(homedir(), ".moltbot", "moltbot.json"), // Future location
];

export function getWorkspacePath() {
  // 1. Check environment variables first
  const env = process.env.MOLTBOT_WORKSPACE || process.env.WORKSPACE_DIR;
  if (env && env.trim()) return env.trim();

  // 2. Check config files
  for (const configPath of CONFIG_PATHS) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf8");
        const data = JSON.parse(raw);
        const workspace = data?.agents?.defaults?.workspace;
        if (typeof workspace === "string" && workspace.trim()) {
          return workspace.trim();
        }
      }
    } catch {
      // Continue to next config file
    }
  }

  // 3. Fallback to default
  return DEFAULT_WORKSPACE;
}

export function getDbPath() {
  const envPath =
    process.env.MOLTBOT_DB_PATH ||
    process.env.TASKS_DB_PATH ||
    process.env.DB_PATH ||
    process.env.DATABASE_URL;
  if (envPath && envPath.trim()) return envPath.trim();

  const defaultPath = path.join(homedir(), "clawdbot", "data", "tasks.db");
  try {
    fs.mkdirSync(path.dirname(defaultPath), { recursive: true });
  } catch {
    // Ignore mkdir failures; sqlite will surface errors on open.
  }
  return defaultPath;
}

const workspacePath = { getWorkspacePath, getDbPath };

export default workspacePath;
