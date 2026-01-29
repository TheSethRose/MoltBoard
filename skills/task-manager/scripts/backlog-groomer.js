#!/usr/bin/env node
/**
 * Backlog Groomer Worker
 * - Selects the next backlog task without groom markers
 * - Agent reviews and clarifies the task
 * - Agent marks as ready or blocked with a summary
 *
 * Uses the MoltBoard API (required for user-based DB isolation).
 */

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

async function markReady(taskId, summary, notesUpdate) {
  if (!summary) {
    console.error("Summary is required (use --summary)");
    return;
  }

  await apiClient.updateTaskStatus(taskId, TASK_STATUS.ready);
  
  if (notesUpdate) {
    await apiClient.appendWorkNote(taskId, `groom:notes: ${notesUpdate}`, "system");
  }

  await apiClient.appendWorkNote(taskId, `groom:done: ${summary}`, "system");
  console.log(`\n✓ Groomed task #${taskId} → ${TASK_STATUS.ready}`);
}

async function markBlocked(taskId, reason, activity) {
  if (!reason) {
    console.error("Block reason is required (use --reason)");
    return;
  }

  await apiClient.updateTaskStatus(taskId, TASK_STATUS.blocked);
  await apiClient.appendWorkNote(taskId, `groom:blocked: ${reason}`, "system");
  await apiClient.appendWorkNote(taskId, `status:blocked: ${reason}`, "system");
  
  if (activity) {
    await apiClient.appendWorkNote(taskId, `activity: ${activity}`, "system");
  }

  console.log(`\n✓ Blocked task #${taskId}: ${reason}`);
}

async function main() {
  const markReadyId = parseInt(getArgValue("--mark-ready") || "", 10);
  const markBlockedId = parseInt(getArgValue("--mark-blocked") || "", 10);
  const summaryArg = getArgValue("--summary");
  const reasonArg = getArgValue("--reason");
  const notesArg = getArgValue("--notes");
  const activityArg = getArgValue("--activity");

  if (markReadyId) {
    await markReady(markReadyId, summaryArg, notesArg);
    process.exit(0);
  }

  if (markBlockedId) {
    await markBlocked(markBlockedId, reasonArg, activityArg);
    process.exit(0);
  }

  // Get all tasks via API
  const { tasks } = await apiClient.getTasks();
  
  const backlogTasks = tasks
    .filter((t) => t.status === TASK_STATUS.backlog)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

  const nextTask = backlogTasks.find((task) => !hasGroomMarker(task.work_notes));

  if (!nextTask) {
    console.log("=== No Backlog Tasks to Groom ===");
    console.log("All backlog tasks already have grooming markers.");
    process.exit(0);
  }

  console.log("=== Backlog Grooming ===");
  console.log(`#${nextTask.task_number}: ${nextTask.text}`);
  if (nextTask.notes) {
    console.log(`\nCurrent Notes:\n${nextTask.notes}`);
  }

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

  // Auto-groom: if task has clear scope in notes, auto-mark ready
  const hasScope = nextTask.notes && (
    nextTask.notes.includes("## Scope") ||
    nextTask.notes.includes("## Target") ||
    nextTask.notes.includes("## Summary")
  );

  if (hasScope) {
    // Generate summary from notes
    const summaryMatch = nextTask.notes.match(/## (Summary|Scope|Target|Goal)[\s\S]*?(?=## |$)/i);
    const summary = summaryMatch
      ? `Plan: ${summaryMatch[0].trim().replace(/\n/g, " ").slice(0, 200)}...`
      : `Review and implement: ${nextTask.text}`;

    console.log("\n✓ Auto-grooming task with clear scope...");
    await markReady(nextTask.id, summary);
    process.exit(0);
  }

  // Manual grooming required
  console.log("\nInstructions:");
  console.log("1) Research and clarify scope, acceptance, and dependencies.");
  console.log("2) Update notes if needed (include plan + definition).");
  console.log("3) Mark ready or blocked using one of the commands below.");
  console.log("\nCommands:");
  console.log(
    `- Mark ready: bun backlog-groomer.js --mark-ready ${nextTask.id} --summary "<summary>" --notes "<append notes>"`,
  );
  console.log(
    `- Block: bun backlog-groomer.js --mark-blocked ${nextTask.id} --reason "<reason>" --activity "<activity log entry>"`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
