#!/usr/bin/env node
/**
 * Append a work note to a task
 * Usage:
 *   bun add-work-note.js --task-id <id> --content "..." [--author system|agent|human]
 *   bun add-work-note.js --task-number <num> --content "..." [--author system|agent|human]
 *   bun add-work-note.js --task-id <id> --content-file /path/to/file [--author system|agent|human]
 *   bun add-work-note.js --task-id <id> --content-stdin [--author system|agent|human]
 *
 * Uses the MoltBoard API (required for user-based DB isolation).
 * Falls back to direct SQLite only if API is unavailable AND DB is accessible.
 */

import fs from "node:fs";
import apiClient from "../../../scripts/api-client.js";
import { getDbPath } from "../../../scripts/workspace-path.js";
import { appendWorkNote as appendWorkNoteDb } from "../../../scripts/work-notes.js";

const DB_PATH = getDbPath();

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const taskId = parseInt(getArgValue("--task-id") || "", 10);
const taskNumber = parseInt(getArgValue("--task-number") || "", 10);
const contentArg = getArgValue("--content");
const contentFile = getArgValue("--content-file");
const contentFromStdin = hasFlag("--content-stdin") ? readStdin() : "";
const contentFromFile = contentFile ? fs.readFileSync(contentFile, "utf8") : "";
const content = contentArg || contentFromFile || contentFromStdin;
const author = getArgValue("--author") || "system";

if (!content || !content.trim()) {
  console.log("--content is required (or use --content-file / --content-stdin)");
  process.exit(1);
}

if (!taskId && !taskNumber) {
  console.log("Provide --task-id or --task-number");
  process.exit(1);
}

async function main() {
  // Try API first (required for user-based DB isolation)
  try {
    let task;
    if (taskId) {
      task = await apiClient.getTask({ id: taskId });
    } else {
      task = await apiClient.getTask({ taskNumber });
    }

    if (!task) {
      console.log("Task not found");
      process.exit(1);
    }

    await apiClient.appendWorkNote(task.id, content.trim(), author);
    console.log(`✓ Added work note to task #${task.task_number}`);
    return;
  } catch (apiError) {
    // API failed - try direct DB access as fallback
    if (!fs.existsSync(DB_PATH)) {
      console.error("API unavailable and database not accessible");
      console.error("API error:", apiError.message);
      process.exit(1);
    }

    console.warn("API unavailable, falling back to direct DB access");
  }

  // Direct DB access fallback (only if API failed and DB exists)
  const { Database } = await import("bun:sqlite");
  const db = new Database(DB_PATH);

  let task;
  if (taskId) {
    task = db
      .prepare("SELECT id, task_number FROM tasks WHERE id = ?")
      .get(taskId);
  } else {
    task = db
      .prepare("SELECT id, task_number FROM tasks WHERE task_number = ?")
      .get(taskNumber);
  }

  if (!task) {
    console.log("Task not found");
    db.close();
    process.exit(1);
  }

  appendWorkNoteDb(db, task.id, content.trim(), author);
  console.log(`✓ Added work note to task #${task.task_number}`);
  db.close();
}

main();
