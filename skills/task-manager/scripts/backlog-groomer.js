#!/usr/bin/env node
/**
 * Backlog Groomer Worker
 * - Selects the next backlog task without groom markers
 * - Agent reviews and clarifies the task
 * - Agent marks as ready or blocked with a summary
 */

import path from "node:path";
import fs from "node:fs";
import { Database } from "bun:sqlite";
import { appendWorkNote, parseWorkNotes } from "../../../scripts/work-notes.js";
import { getDbPath } from "../../../scripts/workspace-path.js";

const DB_PATH = getDbPath();

const DEFAULT_TASK_STATUSES = [
  "backlog",
  "ready",
  "in-progress",
  "pending",
  "blocked",
  "completed",
  "review",
];

function parseStatuses(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);
}

function getTaskStatuses() {
  const parsed = parseStatuses(process.env.TASK_STATUSES || "");
  return parsed.length > 0 ? parsed : [...DEFAULT_TASK_STATUSES];
}

const TASK_STATUSES = getTaskStatuses();

function resolveStatus(envKey, fallback) {
  const raw = process.env[envKey] || fallback;
  if (TASK_STATUSES.includes(raw)) return raw;
  if (TASK_STATUSES.includes(fallback)) return fallback;
  return TASK_STATUSES[0] || fallback;
}

const TASK_STATUS = {
  backlog: resolveStatus("TASK_STATUS_BACKLOG", "backlog"),
  ready: resolveStatus("TASK_STATUS_READY", "ready"),
  blocked: resolveStatus("TASK_STATUS_BLOCKED", "blocked"),
};

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

if (!fs.existsSync(DB_PATH)) {
  console.log("No tasks database found");
  process.exit(0);
}

const db = new Database(DB_PATH);

function hasGroomMarker(workNotesJson) {
  const notes = parseWorkNotes(workNotesJson);
  return notes.some((note) =>
    typeof note?.content === "string"
      ? note.content.toLowerCase().includes("groom:")
      : false,
  );
}

function markReady(taskId, summary, notesUpdate) {
  if (!summary) {
    console.error("Summary is required (use --summary)");
    return;
  }

  if (notesUpdate) {
    db.prepare(
      "UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(TASK_STATUS.ready, taskId);
    appendWorkNote(db, taskId, `groom:notes: ${notesUpdate}`);
  } else {
    db.prepare(
      "UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(TASK_STATUS.ready, taskId);
  }

  appendWorkNote(db, taskId, `groom:done: ${summary}`);
  console.log(`\n✓ Groomed task #${taskId} → ${TASK_STATUS.ready}`);
}

function markBlocked(taskId, reason, activity) {
  if (!reason) {
    console.error("Block reason is required (use --reason)");
    return;
  }

  db.prepare(
    "UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(TASK_STATUS.blocked, taskId);

  appendWorkNote(db, taskId, `groom:blocked: ${reason}`);
  appendWorkNote(db, taskId, `status:blocked: ${reason}`);
  if (activity) {
    appendWorkNote(db, taskId, `activity: ${activity}`);
  }

  console.log(`\n✓ Blocked task #${taskId}: ${reason}`);
}

const markReadyId = parseInt(getArgValue("--mark-ready") || "", 10);
const markBlockedId = parseInt(getArgValue("--mark-blocked") || "", 10);
const summaryArg = getArgValue("--summary");
const reasonArg = getArgValue("--reason");
const notesArg = getArgValue("--notes");
const activityArg = getArgValue("--activity");

if (markReadyId) {
  markReady(markReadyId, summaryArg, notesArg);
  db.close();
  process.exit(0);
}

if (markBlockedId) {
  markBlocked(markBlockedId, reasonArg, activityArg);
  db.close();
  process.exit(0);
}

const backlogTasks = db
  .prepare(
    `
  SELECT id, task_number, text, notes, work_notes, created_at, updated_at
  FROM tasks
  WHERE status = ?
  ORDER BY sort_order ASC, id ASC
`,
  )
  .all(TASK_STATUS.backlog);

const nextTask = backlogTasks.find((task) => !hasGroomMarker(task.work_notes));

if (!nextTask) {
  console.log("=== No Backlog Tasks to Groom ===");
  console.log("All backlog tasks already have grooming markers.");
  db.close();
  process.exit(0);
}

console.log("=== Backlog Grooming ===");
console.log(`#${nextTask.task_number}: ${nextTask.text}`);
if (nextTask.notes) {
  console.log(`\nCurrent Notes:\n${nextTask.notes}`);
}
if (nextTask.work_notes) {
  const notes = parseWorkNotes(nextTask.work_notes);
  if (notes.length > 0) {
    console.log("\nRecent Work Notes:");
    notes.slice(-10).forEach((note) => {
      const author = note.author || "system";
      const ts = note.timestamp || "";
      const content = note.content || "";
      console.log(`- [${author}] ${ts} ${content}`.trim());
    });
  }
}
console.log("\nInstructions:");
console.log("1) Research and clarify scope, acceptance, and dependencies.");
console.log("2) Update notes if needed (include plan + definition).");
console.log("3) Mark ready or blocked using one of the commands below.");
console.log("\nCommands:");
console.log(
  `- Mark ready: node scripts/backlog-groomer.js --mark-ready ${nextTask.id} --summary "<summary>" --notes "<append notes>"`,
);
console.log(
  `- Block: node scripts/backlog-groomer.js --mark-blocked ${nextTask.id} --reason "<reason>" --activity "<activity log entry>"`,
);

db.close();
