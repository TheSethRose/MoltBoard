import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { getDb, releaseDb } from "@/lib/db";
import { TaskSummary } from "@/types/task";
import { getWorkspacePath } from "@/lib/workspace-path";
import {
  withErrorHandling,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

const execAsync = promisify(exec);

interface UptimeData {
  raw: string;
  formatted: string;
  days: number;
  hours: number;
  minutes: number;
}

interface SystemHealth {
  moltbot: string;
  git: string;
  uptime: UptimeData;
}

interface SessionDetail {
  key: string;
  model: string;
  contextTokens: number;
  ageMs: number;
}

interface RawSessionInfo {
  key?: string;
  model?: string;
  contextTokens?: number;
  ageMs?: number;
}

interface SessionInfo {
  count: number;
  details: SessionDetail[];
}

interface ProcessSessionInfo {
  sessionId: string;
  startTime: string;
  pid: number;
}

interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

interface DiskUsage {
  total: number;
  used: number;
  free: number;
  percent: number;
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface StatusResponse {
  tasks: TaskSummary[];
  health: SystemHealth;
  sessionInfo?: SessionInfo;
  processSession: ProcessSessionInfo;
  memory: MemoryUsage;
  disk?: DiskUsage;
  tokens?: TokenUsage;
  timestamp: string;
}

interface DbTask {
  id: number;
  task_number: number | null;
  status: string;
  text: string;
  tags: string;
  priority: string | null;
  sort_order: number;
}

// Strip ANSI escape codes from CLI output
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

// Parse uptime output like " 10:57AM  up 21 mins, 2 users, load averages: 1.33 1.31 1.29"
function parseUptime(output: string): UptimeData {
  const raw = output.trim();

  // Match patterns like: "up 21 mins", "up 2:15", "up 5 days, 3:10"
  const match = raw.match(
    /up\s+(\d+\s+(?:mins?|hours?|days?))?(?:,\s*(\d+)\s+users?)?/i,
  );

  if (!match) {
    return { raw, formatted: "Unknown", days: 0, hours: 0, minutes: 0 };
  }

  const timeStr = match[1] || "";
  let days = 0,
    hours = 0,
    minutes = 0;

  // Parse time components
  if (timeStr.includes("day")) {
    const parts = timeStr.split(/[,\s]+/);
    days = parseInt(parts[0]) || 0;
    if (parts[2]) {
      const hms = parts[2].split(":");
      hours = parseInt(hms[0]) || 0;
      minutes = parseInt(hms[1]) || 0;
    }
  } else if (timeStr.includes(":")) {
    const hms = timeStr.split(":");
    hours = parseInt(hms[0]) || 0;
    minutes = parseInt(hms[1]) || 0;
  } else if (timeStr.includes("hour")) {
    hours = parseInt(timeStr.split(/\s+/)[0]) || 0;
  } else if (timeStr.includes("min")) {
    minutes = parseInt(timeStr.split(/\s+/)[0]) || 0;
  }

  // Format for display
  let formatted = "";
  if (days > 0) formatted += `${days}d `;
  if (hours > 0) formatted += `${hours}h `;
  if (minutes > 0 || formatted === "") formatted += `${minutes}m`;

  return { raw, formatted: formatted.trim(), days, hours, minutes };
}

function getTasksFromDb(): TaskSummary[] {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT id, task_number, status, text, tags, priority, sort_order
      FROM tasks 
      ORDER BY sort_order ASC, id ASC
    `,
      )
      .all() as DbTask[];
    releaseDb(db);

    return rows.map((row) => ({
      id: row.id,
      task_number: row.task_number || row.id,
      status: row.status as TaskSummary["status"],
      text: row.text,
      tags: JSON.parse(row.tags || "[]"),
      priority: (row.priority as TaskSummary["priority"]) || undefined,
      order: row.sort_order,
    }));
  } catch (error) {
    logError(error as Error, {
      route: "/api/status",
      method: "getTasksFromDb",
    });
    throw databaseError(error);
  }
}

async function getSystemHealth(): Promise<SystemHealth> {
  const health: SystemHealth = {
    moltbot: "unknown",
    git: "unknown",
    uptime: { raw: "", formatted: "Unknown", days: 0, hours: 0, minutes: 0 },
  };

  try {
    const { stdout: moltbotStatus } = await execAsync(
      "moltbot status 2>&1 | head -5",
    );
    health.moltbot = stripAnsi(moltbotStatus) || "running";
  } catch (error) {
    logError(error as Error, {
      route: "/api/status",
      method: "getSystemHealth/moltbot",
    });
    health.moltbot = "unavailable";
  }

  try {
    const workspacePath = getWorkspacePath();
    const { stdout: gitStatus } = await execAsync(
      `cd ${workspacePath} && git status --porcelain 2>&1 | head -10`,
    );
    const changes = gitStatus
      .trim()
      .split("\n")
      .filter((l) => l).length;
    health.git = changes > 0 ? `${changes} uncommitted` : "clean";
  } catch (error) {
    logError(error as Error, {
      route: "/api/status",
      method: "getSystemHealth/git",
    });
    health.git = "not a repo";
  }

  try {
    const { stdout: uptime } = await execAsync("uptime");
    health.uptime = parseUptime(uptime);
  } catch (error) {
    logError(error as Error, {
      route: "/api/status",
      method: "getSystemHealth/uptime",
    });
    health.uptime = {
      raw: "unavailable",
      formatted: "Unknown",
      days: 0,
      hours: 0,
      minutes: 0,
    };
  }

  return health;
}

function getProcessSessionInfo(): ProcessSessionInfo {
  // Generate session ID from process start time
  const startTime = process.env.SESSION_START_TIME || new Date().toISOString();
  const sessionId = Buffer.from(startTime).toString("base64").slice(0, 12);

  return {
    sessionId,
    startTime,
    pid: process.pid,
  };
}

function getMemoryUsage(): MemoryUsage {
  const mem = process.memoryUsage();

  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external,
  };
}

function getDiskUsage(): DiskUsage {
  try {
    const stats = fs.statfsSync(getWorkspacePath());
    const total = stats.bsize * stats.blocks;
    const free = stats.bfree * stats.bsize;
    const used = total - free;

    return {
      total,
      used,
      free,
      percent: Math.round((used / total) * 100),
    };
  } catch (error) {
    logError(error as Error, { route: "/api/status", method: "getDiskUsage" });
    return {
      total: 0,
      used: 0,
      free: 0,
      percent: 0,
    };
  }
}

async function getTokenUsage(): Promise<TokenUsage | undefined> {
  // Try to read token usage from file if it exists
  try {
    const tokenFile = path.join(getWorkspacePath(), "data", "token_usage.json");
    const fs = await import("fs");
    if (fs.existsSync(tokenFile)) {
      const content = fs.readFileSync(tokenFile, "utf-8");
      const data = JSON.parse(content);
      return {
        input: data.input || 0,
        output: data.output || 0,
        total: (data.input || 0) + (data.output || 0),
      };
    }
  } catch {
    // Token file not available
  }
  return undefined;
}

async function getMoltbotSessionInfo(): Promise<SessionInfo | undefined> {
  try {
    const { stdout } = await execAsync("moltbot sessions --json");
    const data = JSON.parse(stdout);

    return {
      count: data.count || 0,
      details: Array.isArray(data.sessions)
        ? data.sessions.map((s: RawSessionInfo) => ({
            key: s.key || "unknown",
            model: s.model || "unknown",
            contextTokens: s.contextTokens || 0,
            ageMs: s.ageMs || 0,
          }))
        : [],
    };
  } catch (error) {
    console.error("Failed to get session info:", error);
    return undefined;
  }
}

// GET - Fetch status
export const GET = withErrorHandling(
  async (): Promise<NextResponse> => {
    let tasks: TaskSummary[] | null = null;
    let health: SystemHealth | null = null;

    try {
      tasks = getTasksFromDb();
    } catch (error) {
      logError(error as Error, { route: "/api/status", method: "GET/tasks" });
      // Continue without tasks on error
    }

    try {
      health = await getSystemHealth();
    } catch (error) {
      logError(error as Error, { route: "/api/status", method: "GET/health" });
      // Continue without health on error
    }

    const sessionInfo = await getMoltbotSessionInfo();
    const processSession = getProcessSessionInfo();
    const memory = getMemoryUsage();
    const tokens = await getTokenUsage();

    const response: StatusResponse = {
      tasks: tasks || [],
      health: health || {
        moltbot: "unavailable",
        git: "unavailable",
        uptime: {
          raw: "unavailable",
          formatted: "Unknown",
          days: 0,
          hours: 0,
          minutes: 0,
        },
      },
      sessionInfo,
      processSession,
      memory,
      disk: getDiskUsage(),
      tokens,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  },
  { context: { route: "/api/status", method: "GET" } },
);
