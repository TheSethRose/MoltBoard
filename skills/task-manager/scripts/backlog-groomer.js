#!/usr/bin/env node
/**
 * Backlog Groomer Worker
 * - Selects the next backlog task without groom markers
 * - Agent reviews and clarifies the task
 * - Agent marks as ready or blocked with a summary
 *
 * Uses the MoltBoard API (required for user-based DB isolation).
 */

import fs from "node:fs";
import apiClient from "../../../scripts/api-client.js";

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

function readArgOrFile({ value, fileFlag, stdinFlag }) {
  if (value) return value;
  const filePath = getArgValue(fileFlag);
  if (filePath) {
    return fs.readFileSync(filePath, "utf8");
  }
  if (hasFlag(stdinFlag)) {
    return readStdin();
  }
  return "";
}

function parseWorkNotes(workNotes) {
  if (!workNotes) return [];
  if (Array.isArray(workNotes)) return workNotes;
  try {
    return JSON.parse(workNotes);
  } catch {
    return [];
  }
}

function hasGroomMarker(workNotes) {
  const notes = parseWorkNotes(workNotes);
  return notes.some((note) =>
    typeof note?.content === "string"
      ? note.content.toLowerCase().includes("groom:")
      : false,
  );
}

function buildAssistInput(task, projectName) {
  const tags = Array.isArray(task.tags) ? task.tags.join(", ") : "none";
  const blocked = Array.isArray(task.blocked_by) && task.blocked_by.length > 0
    ? task.blocked_by.map((id) => `#${id}`).join(", ")
    : "none";
  return [
    `Title: ${task.text || "(empty)"}`,
    `Description: ${task.notes || "(empty)"}`,
    `Status: ${task.status || "unknown"}`,
    `Project: ${projectName || "none"}`,
    `Priority: ${task.priority || "none"}`,
    `Tags: ${tags || "none"}`,
    `Blocked By: ${blocked}`,
    `Activity Log (read-only context; do not include in output):`,
  ].join("\n");
}

function buildNotesFromAssist(output) {
  const scope = Array.isArray(output.scope) ? output.scope : [];
  const outOfScope = Array.isArray(output.outOfScope) ? output.outOfScope : [];
  const deps = Array.isArray(output.dependencies) ? output.dependencies : [];
  const criteria = Array.isArray(output.acceptanceCriteria)
    ? output.acceptanceCriteria
    : [];

  return [
    `## Goal\n${output.goal || ""}`,
    `\n## Scope\n${scope.map((s) => `- ${s}`).join("\n")}`,
    `\n## Out of Scope\n${outOfScope.map((s) => `- ${s}`).join("\n")}`,
    `\n## Dependencies\n${deps.map((s) => `- ${s}`).join("\n")}`,
    `\n## Acceptance Criteria\n${criteria.map((s) => `- ${s}`).join("\n")}`,
  ].join("\n");
}

async function runMoltbotAssist(task, projectName) {
  const input = buildAssistInput(task, projectName);
  const notes = parseWorkNotes(task.work_notes)
    .slice(-10)
    .map((note) => {
      const author = note?.author || "system";
      const timestamp = note?.timestamp || "";
      const content = note?.content || "";
      return `- [${author}] ${timestamp} ${content}`.trim();
    })
    .join("\n");

  const res = await fetch("http://localhost:5278/api/clawdbot/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "task-form", input, notes }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || json?.message || "Assist failed");
  }
  return json;
}

async function markReady(taskId, summary, notesUpdate) {
  if (!summary) {
    console.error("[GROOMER] ERROR: Summary is required (use --summary)");
    return;
  }

  const task = await apiClient.getTask({ id: taskId });
  const taskNum = task?.task_number || taskId;
  const taskTitle = task?.text?.trim();
  const identityPrefix = taskTitle
    ? `Task #${taskNum} — ${taskTitle}. `
    : `Task #${taskNum}. `;

  console.log(`[GROOMER] ACTION: Marking task #${taskNum} as ready`);
  console.log(`[GROOMER] SUMMARY: ${summary}`);

  await apiClient.updateTaskStatus(taskId, TASK_STATUS.ready);

  if (notesUpdate) {
    await apiClient.appendWorkNote(
      taskId,
      `groom:notes: ${identityPrefix}${notesUpdate}`,
      "system",
    );
    console.log(`[GROOMER] NOTES: ${notesUpdate}`);
  }

  await apiClient.appendWorkNote(
    taskId,
    `groom:done: ${identityPrefix}${summary}`,
    "system",
  );
  console.log(`[GROOMER] RESULT: Task #${taskNum} → ${TASK_STATUS.ready}`);
}

async function markBlocked(taskId, reason, activity) {
  if (!reason) {
    console.error("[GROOMER] ERROR: Block reason is required (use --reason)");
    return;
  }

  const task = await apiClient.getTask({ id: taskId });
  const taskNum = task?.task_number || taskId;

  console.log(`[GROOMER] ACTION: Blocking task #${taskNum}`);
  console.log(`[GROOMER] REASON: ${reason}`);

  await apiClient.updateTaskStatus(taskId, TASK_STATUS.blocked);
  await apiClient.appendWorkNote(taskId, `groom:blocked: ${reason}`, "system");
  await apiClient.appendWorkNote(taskId, `status:blocked: ${reason}`, "system");

  if (activity) {
    await apiClient.appendWorkNote(taskId, `activity: ${activity}`, "system");
    console.log(`[GROOMER] ACTIVITY: ${activity}`);
  }

  console.log(`[GROOMER] RESULT: Task #${taskNum} → ${TASK_STATUS.blocked}`);
}

async function main() {
  console.log(`[GROOMER] START: ${new Date().toISOString()}`);

  const markReadyId = parseInt(getArgValue("--mark-ready") || "", 10);
  const markBlockedId = parseInt(getArgValue("--mark-blocked") || "", 10);
  const summaryArg = readArgOrFile({
    value: getArgValue("--summary"),
    fileFlag: "--summary-file",
    stdinFlag: "--summary-stdin",
  });
  const reasonArg = readArgOrFile({
    value: getArgValue("--reason"),
    fileFlag: "--reason-file",
    stdinFlag: "--reason-stdin",
  });
  const notesArg = readArgOrFile({
    value: getArgValue("--notes"),
    fileFlag: "--notes-file",
    stdinFlag: "--notes-stdin",
  });
  const activityArg = readArgOrFile({
    value: getArgValue("--activity"),
    fileFlag: "--activity-file",
    stdinFlag: "--activity-stdin",
  });

  if (markReadyId) {
    await markReady(markReadyId, summaryArg, notesArg);
    console.log(`[GROOMER] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  if (markBlockedId) {
    await markBlocked(markBlockedId, reasonArg, activityArg);
    console.log(`[GROOMER] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  // Get all tasks via API
  const { tasks } = await apiClient.getTasks();

  const backlogTasks = tasks
    .filter((t) => t.status === TASK_STATUS.backlog)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

  console.log(`[GROOMER] SCAN: Found ${backlogTasks.length} backlog task(s)`);

  const nextTask = backlogTasks.find(
    (task) => !hasGroomMarker(task.work_notes),
  );

  if (!nextTask) {
    console.log("[GROOMER] SKIP: All backlog tasks already have groom markers");
    console.log(`[GROOMER] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  console.log(
    `[GROOMER] SELECT: Task #${nextTask.task_number} (id=${nextTask.id})`,
  );
  console.log(`[GROOMER] TITLE: ${nextTask.text}`);

  if (nextTask.notes) {
    console.log(`[GROOMER] HAS_NOTES: yes (${nextTask.notes.length} chars)`);
  } else {
    console.log(`[GROOMER] HAS_NOTES: no`);
  }

  const notes = parseWorkNotes(nextTask.work_notes);
  console.log(`[GROOMER] WORK_NOTES: ${notes.length} entries`);

  let projectName = "";
  if (nextTask.project_id) {
    try {
      const project = await apiClient.getProject(nextTask.project_id);
      projectName = project?.project?.name || "";
    } catch {
      projectName = "";
    }
  }

  console.log("[GROOMER] ASSIST: running Moltbot Assist prompt");
  let assistOutput;
  try {
    const assist = await runMoltbotAssist(nextTask, projectName);
    assistOutput = assist?.output || assist?.result || assist;
  } catch (err) {
    console.error("[GROOMER] ASSIST ERROR:", err.message);
    process.exit(1);
  }

  const groomedTitle = assistOutput.title || nextTask.text;
  const groomedNotes = buildNotesFromAssist(assistOutput);
  const groomedTags = Array.isArray(assistOutput.tags)
    ? assistOutput.tags
    : nextTask.tags || [];
  const groomedPriority = assistOutput.priority || nextTask.priority || null;

  await apiClient.updateTask(nextTask.id, {
    text: groomedTitle,
    notes: groomedNotes,
    tags: groomedTags,
    priority: groomedPriority,
  });

  await apiClient.appendWorkNote(
    nextTask.id,
    `groom:done: Applied Moltbot Assist (task-form) output to task fields`,
    "system",
  );

  await apiClient.updateTaskStatus(nextTask.id, TASK_STATUS.ready);
  console.log(`[GROOMER] RESULT: Task #${nextTask.task_number} → ${TASK_STATUS.ready}`);
  console.log(`[GROOMER] END: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
