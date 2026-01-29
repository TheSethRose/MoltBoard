#!/usr/bin/env node
/**
 * SQLite-backed task manager CLI for agent use.
 * Commands: list, add, update, complete, delete, count
 */
import path from "node:path";
import fs from "node:fs";
import { Database } from "bun:sqlite";
import { getDbPath } from "../../../scripts/workspace-path.js";

const DB_PATH = getDbPath();

if (!fs.existsSync(DB_PATH)) {
  console.error("Database not found at", DB_PATH);
  console.error("Run: node <workspace>/scripts/init-db.js");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: false });

const STATUS_MARKERS = {
  backlog: "[~]",
  ready: "[ ]",
  "in-progress": "[*]",
  completed: "[x]",
  blocked: "[!]",
};

// Task status values (must match API)
// - backlog: Not ready, waiting to be prioritized
// - ready: Available to pick up
// - in-progress: Currently being worked
// - completed: Finished
// - blocked: Cannot proceed (has dependencies)

const DEFAULT_STATUSES = [
  "backlog",
  "ready",
  "in-progress",
  "pending",
  "completed",
  "blocked",
];

function parseEnvStatuses(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);
}

const STATUS_LIST =
  parseEnvStatuses(process.env.TASK_STATUSES).length > 0
    ? parseEnvStatuses(process.env.TASK_STATUSES)
    : DEFAULT_STATUSES;

const DEFAULT_STATUS =
  process.env.TASK_STATUS_DEFAULT &&
  STATUS_LIST.includes(process.env.TASK_STATUS_DEFAULT)
    ? process.env.TASK_STATUS_DEFAULT
    : STATUS_LIST[0] || "backlog";

const [, , command, ...args] = process.argv;

function printTask(task) {
  const marker = STATUS_MARKERS[task.status] || "[ ]";
  const tags = JSON.parse(task.tags || "[]");
  const tagStr = tags.length > 0 ? ` (${tags.join(", ")})` : "";
  const priorityStr = task.priority ? ` [${task.priority}]` : "";
  console.log(`- ${marker} ${task.text}${tagStr}${priorityStr}`);
}

function listTasks(filter = "all") {
  let query = "SELECT * FROM tasks";
  const params = [];

  if (filter !== "all") {
    query += " WHERE status = ?";
    params.push(filter);
  }

  query += " ORDER BY sort_order ASC, id ASC";

  const tasks = db.prepare(query).all(...params);

  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  tasks.forEach(printTask);
}

function addTask(text, status = "backlog") {
  if (!text) {
    console.error('Usage: db-tasks.js add "<task text>" [status]');
    process.exit(1);
  }

  const validStatuses = STATUS_LIST;
  if (!validStatuses.includes(status)) {
    status = DEFAULT_STATUS;
  }

  const maxOrder = db.prepare("SELECT MAX(sort_order) as max FROM tasks").get();
  const sortOrder = (maxOrder?.max || 0) + 1;

  const maxTaskNumber = db
    .prepare("SELECT MAX(task_number) as max FROM tasks")
    .get();
  const taskNumber = (maxTaskNumber?.max || 0) + 1;

  db.prepare(
    `
    INSERT INTO tasks (text, status, sort_order, task_number)
    VALUES (?, ?, ?, ?)
  `,
  ).run(text, status, sortOrder, taskNumber);

  console.log(`✓ Added task #${taskNumber}: ${text}`);
}

function updateTask(pattern, newStatus) {
  if (!pattern || !newStatus) {
    console.error('Usage: db-tasks.js update "<pattern>" <status>');
    console.error("Statuses: ready, in-progress, pending, completed, blocked");
    process.exit(1);
  }

  const validStatuses = STATUS_LIST;
  if (!validStatuses.includes(newStatus)) {
    console.error(`Invalid status: ${newStatus}`);
    console.error("Valid statuses:", validStatuses.join(", "));
    process.exit(1);
  }

  // Support numeric ID lookup
  const numericId = parseInt(pattern, 10);
  let task = null;

  if (!isNaN(numericId)) {
    task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(numericId);
  }

  if (!task) {
    task = db
      .prepare("SELECT * FROM tasks WHERE text LIKE ? LIMIT 1")
      .get(`%${pattern}%`);
  }

  if (!task) {
    console.error(`No task matching: ${pattern}`);
    process.exit(1);
  }

  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(
    newStatus,
    task.id,
  );
  console.log(`✓ Updated task #${task.id} to ${newStatus}`);
  printTask({ ...task, status: newStatus });

  // If marking as completed, update tasks that had this as a blocker
  if (newStatus === "completed") {
    updateBlockers(task.id);
  }
}

function updateBlockers(completedTaskId) {
  // Find all tasks that have this task as a blocker
  const blockedTasks = db
    .prepare("SELECT * FROM tasks WHERE blocked_by LIKE ?")
    .all(`%${completedTaskId}%`);

  blockedTasks.forEach((blockedTask) => {
    const blockers = JSON.parse(blockedTask.blocked_by || "[]");
    const newBlockers = blockers.filter((id) => id !== completedTaskId);

    if (newBlockers.length === 0) {
      // No more blockers - move to ready if currently blocked
      if (blockedTask.status === "blocked") {
        db.prepare(
          "UPDATE tasks SET blocked_by = ?, status = ? WHERE id = ?",
        ).run("[]", "ready", blockedTask.id);
        console.log(`→ Unblocked and moved to ready: #${blockedTask.id}`);
      } else {
        db.prepare("UPDATE tasks SET blocked_by = ? WHERE id = ?").run(
          "[]",
          blockedTask.id,
        );
        console.log(`→ Removed blocker from: #${blockedTask.id}`);
      }
    } else {
      // Still has other blockers - just update the array
      db.prepare("UPDATE tasks SET blocked_by = ? WHERE id = ?").run(
        JSON.stringify(newBlockers),
        blockedTask.id,
      );
      console.log(
        `→ Updated blockers for: #${blockedTask.id} (remaining: ${newBlockers.join(", ")})`,
      );
    }
  });
}

function completeTask(pattern) {
  if (!pattern) {
    console.error('Usage: db-tasks.js complete "<pattern>"');
    process.exit(1);
  }

  // Support numeric ID lookup
  const numericId = parseInt(pattern, 10);
  let task = null;

  if (!isNaN(numericId)) {
    task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(numericId);
  }

  if (!task) {
    task = db
      .prepare("SELECT * FROM tasks WHERE text LIKE ? LIMIT 1")
      .get(`%${pattern}%`);
  }

  if (!task) {
    console.error(`No task matching: ${pattern}`);
    process.exit(1);
  }

  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(
    "completed",
    task.id,
  );
  console.log(`✓ Completed task #${task.id}`);
  printTask({ ...task, status: "completed" });

  // Update tasks that had this task as a blocker
  updateBlockers(task.id);
}

function deleteTask(pattern) {
  if (!pattern) {
    console.error('Usage: db-tasks.js delete "<pattern>"');
    process.exit(1);
  }

  // Support numeric ID lookup
  const numericId = parseInt(pattern, 10);
  let task = null;

  if (!isNaN(numericId)) {
    task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(numericId);
  }

  if (!task) {
    task = db
      .prepare("SELECT * FROM tasks WHERE text LIKE ? LIMIT 1")
      .get(`%${pattern}%`);
  }

  if (!task) {
    console.error(`No task matching: ${pattern}`);
    process.exit(1);
  }

  db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
  console.log(`✓ Deleted task #${task.id}: ${task.text}`);
}

function countTasks() {
  const rows = db
    .prepare(
      `
    SELECT status, COUNT(*) as count
    FROM tasks
    GROUP BY status
  `,
    )
    .all();

  const counts = new Map(rows.map((row) => [row.status, row.count]));

  const summary = STATUS_LIST.map((status) => {
    const label = status.replace(/-/g, " ");
    const count = counts.get(status) || 0;
    return `${label.replace(/\b\w/g, (c) => c.toUpperCase())}: ${count}`;
  }).join(" | ");

  console.log(summary);
}

function showHelp() {
  console.log(`
Task Manager CLI (SQLite-backed)

Usage: db-tasks.js <command> [args]

Commands:
  list [filter]           List tasks (filter: any status or "all")
  add "<text>" [status]   Add new task (default: ${DEFAULT_STATUS})
  update "<pattern>" <status>  Update task status
  complete "<pattern>"    Mark task as completed
  delete "<pattern>"      Delete a task
  count                   Show task counts by status
  help                    Show this help

Statuses: ${STATUS_LIST.join(", ")}
`);
}

switch (command) {
  case "list":
    listTasks(args[0] || "all");
    break;
  case "add":
    addTask(args[0], args[1]);
    break;
  case "update":
    updateTask(args[0], args[1]);
    break;
  case "complete":
    completeTask(args[0]);
    break;
  case "delete":
    deleteTask(args[0]);
    break;
  case "count":
    countTasks();
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}

db.close();
