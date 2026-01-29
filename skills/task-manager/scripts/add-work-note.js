#!/usr/bin/env node
/**
 * Append a work note to a task
 * Usage:
 *   bun add-work-note.js --task-id <id> --content "..." [--author system|agent|human]
 *   bun add-work-note.js --task-number <num> --content "..." [--author system|agent|human]
 *
 * When running in Docker sandbox, uses the MoltBoard API.
 * When running on host, uses direct SQLite access.
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

if (!fs.existsSync(DB_PATH)) {
  console.log("No tasks database found");
  process.exit(1);
}

const taskId = parseInt(getArgValue("--task-id") || "", 10);
const taskNumber = parseInt(getArgValue("--task-number") || "", 10);
const content = getArgValue("--content");
const author = getArgValue("--author") || "system";

if (!content || !content.trim()) {
  console.log("--content is required");
  process.exit(1);
}

if (!taskId && !taskNumber) {
  console.log("Provide --task-id or --task-number");
  process.exit(1);
}

async function main() {
  // Try API first (works in Docker sandbox)
  if (apiClient.IS_DOCKER) {
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
    } catch (error) {
      console.error("API error:", error.message);
      process.exit(1);
    }
  }

  // Direct DB access on host
  if (!fs.existsSync(DB_PATH)) {
    console.log("No tasks database found");
    process.exit(1);
  }

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
