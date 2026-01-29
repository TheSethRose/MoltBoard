#!/usr/bin/env node
/**
 * Review Worker
 * - Selects the next task in Review status
 * - Agent reviews and approves or requests changes
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

const REVIEW_COOLDOWN_MINUTES = parseInt(
  process.env.REVIEW_COOLDOWN_MINUTES || "60",
  10,
);

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

const REVIEW_STATUS_ENV =
  process.env.TASK_STATUS_REVIEW ||
  process.env.NEXT_PUBLIC_TASK_STATUS_REVIEW ||
  "review";

if (!TASK_STATUSES.includes(REVIEW_STATUS_ENV)) {
  TASK_STATUSES.push(REVIEW_STATUS_ENV);
}

function resolveStatus(envKey, fallback) {
  const raw = process.env[envKey] || fallback;
  if (TASK_STATUSES.includes(raw)) return raw;
  if (TASK_STATUSES.includes(fallback)) return fallback;
  return TASK_STATUSES[0] || fallback;
}

const TASK_STATUS = {
  ready: resolveStatus("TASK_STATUS_READY", "ready"),
  review: resolveStatus("TASK_STATUS_REVIEW", "review"),
  completed: resolveStatus("TASK_STATUS_COMPLETED", "completed"),
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

function hasRecentReviewComment(workNotes) {
  const notes = parseWorkNotes(workNotes);
  const now = Date.now();
  const cooldownMs = REVIEW_COOLDOWN_MINUTES * 60 * 1000;
  return notes.some((note) => {
    if (!note || typeof note.content !== "string") return false;
    if (!note.timestamp) return false;
    if (!note.content.toLowerCase().includes("review:")) return false;
    const ts = Date.parse(note.timestamp);
    if (Number.isNaN(ts)) return false;
    return now - ts < cooldownMs;
  });
}

function hasCompletedReview(workNotes) {
  const notes = parseWorkNotes(workNotes);
  return notes.some((note) => {
    if (!note || typeof note.content !== "string") return false;
    return note.content.toLowerCase().includes("review:done");
  });
}

async function markApproved(taskId, summary, activity) {
  if (!summary) {
    console.error("[REVIEW] ERROR: Summary is required (use --summary)");
    return;
  }

  const task = await apiClient.getTask({ id: taskId });
  const taskNum = task?.task_number || taskId;

  console.log(`[REVIEW] ACTION: Approving task #${taskNum}`);
  console.log(`[REVIEW] SUMMARY: ${summary}`);

  await apiClient.appendWorkNote(taskId, `review:done: ${summary}`, "system");
  if (activity) {
    await apiClient.appendWorkNote(taskId, `activity: ${activity}`, "system");
    console.log(`[REVIEW] ACTIVITY: ${activity}`);
  } else {
    await apiClient.appendWorkNote(
      taskId,
      "activity: review approved; awaiting human confirmation",
      "system",
    );
  }
  console.log(`[REVIEW] RESULT: Task #${taskNum} approved → awaiting human`);
}

async function requestChanges(taskId, summary, activity) {
  if (!summary) {
    console.error("[REVIEW] ERROR: Summary is required (use --summary)");
    return;
  }

  const task = await apiClient.getTask({ id: taskId });
  const taskNum = task?.task_number || taskId;

  console.log(`[REVIEW] ACTION: Requesting changes for task #${taskNum}`);
  console.log(`[REVIEW] SUMMARY: ${summary}`);

  await apiClient.updateTaskStatus(taskId, TASK_STATUS.ready);
  await apiClient.appendWorkNote(taskId, `review:failed: ${summary}`, "system");
  if (activity) {
    await apiClient.appendWorkNote(taskId, `activity: ${activity}`, "system");
    console.log(`[REVIEW] ACTIVITY: ${activity}`);
  } else {
    await apiClient.appendWorkNote(
      taskId,
      "activity: review completed; decision: changes requested",
      "system",
    );
  }
  console.log(`[REVIEW] RESULT: Task #${taskNum} → ${TASK_STATUS.ready} (changes requested)`);
}

async function main() {
  console.log(`[REVIEW] START: ${new Date().toISOString()}`);

  const approveId = parseInt(getArgValue("--approve") || "", 10);
  const requestChangesId = parseInt(getArgValue("--request-changes") || "", 10);
  const summaryArg = getArgValue("--summary");
  const activityArg = getArgValue("--activity");

  if (approveId) {
    await markApproved(approveId, summaryArg, activityArg);
    console.log(`[REVIEW] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  if (requestChangesId) {
    await requestChanges(requestChangesId, summaryArg, activityArg);
    console.log(`[REVIEW] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  // Get all tasks via API
  const { tasks } = await apiClient.getTasks();
  
  const reviewTasks = tasks
    .filter((t) => t.status === TASK_STATUS.review)
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));

  console.log(`[REVIEW] SCAN: Found ${reviewTasks.length} task(s) in review status`);

  const nextTask = reviewTasks.find(
    (task) =>
      !hasCompletedReview(task.work_notes) &&
      !hasRecentReviewComment(task.work_notes),
  );

  if (!nextTask) {
    console.log("[REVIEW] SKIP: No tasks need review (all have recent review notes or none available)");
    console.log(`[REVIEW] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  console.log(`[REVIEW] SELECT: Task #${nextTask.task_number} (id=${nextTask.id})`);
  console.log(`[REVIEW] TITLE: ${nextTask.text}`);
  
  if (nextTask.notes) {
    console.log(`[REVIEW] HAS_NOTES: yes (${nextTask.notes.length} chars)`);
  }
  
  const notes = parseWorkNotes(nextTask.work_notes);
  console.log(`[REVIEW] WORK_NOTES: ${notes.length} entries`);
  
  // Output the checklist for manual review
  console.log(`[REVIEW] CHECKLIST:`);
  console.log(`  1. git status -sb`);
  console.log(`  2. cat <each changed file>`);
  console.log(`  3. grep -n 'TODO|mock|placeholder' <files>`);
  console.log(`  4. Verify implementation complete`);
  console.log(`[REVIEW] COMMANDS:`);
  console.log(`  Approve: bun review-worker.js --approve ${nextTask.id} --summary "<verified>"`);
  console.log(`  Reject:  bun review-worker.js --request-changes ${nextTask.id} --summary "<issues>"`);
  console.log(`[REVIEW] END: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
