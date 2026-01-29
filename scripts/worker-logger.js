#!/usr/bin/env node
/**
 * Worker Logger
 * Logs output to both stdout AND a file for cron visibility.
 */

import fs from "node:fs";
import path from "node:path";

const LOG_DIR = process.env.WORKER_LOG_DIR || path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "workers.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Rotate log if too large
function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const backupPath = LOG_FILE + ".1";
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.renameSync(LOG_FILE, backupPath);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

rotateIfNeeded();

/**
 * Create a logger for a specific worker
 * @param {string} workerName - Name of the worker (e.g., "groomer", "worker", "review")
 */
export function createLogger(workerName) {
  const prefix = `[${workerName}]`;

  function formatLine(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    return `${timestamp} ${prefix} ${level}: ${message}`;
  }

  function writeToFile(line) {
    try {
      fs.appendFileSync(LOG_FILE, line + "\n");
    } catch {
      // Ignore file write errors
    }
  }

  return {
    log(...args) {
      const line = formatLine("INFO", ...args);
      console.log(...args);
      writeToFile(line);
    },
    info(...args) {
      const line = formatLine("INFO", ...args);
      console.log(...args);
      writeToFile(line);
    },
    warn(...args) {
      const line = formatLine("WARN", ...args);
      console.warn(...args);
      writeToFile(line);
    },
    error(...args) {
      const line = formatLine("ERROR", ...args);
      console.error(...args);
      writeToFile(line);
    },
    action(taskId, action, details = "") {
      const line = formatLine("ACTION", `task=${taskId} action=${action}${details ? ` ${details}` : ""}`);
      console.log(`✓ ${action} task #${taskId}${details ? `: ${details}` : ""}`);
      writeToFile(line);
    },
    getLogPath() {
      return LOG_FILE;
    },
  };
}

export default createLogger;
