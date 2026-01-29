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
    console.error("Summary is required (use --summary)");
    return;
  }

  await apiClient.appendWorkNote(taskId, `review:done: ${summary}`, "system");
  if (activity) {
    await apiClient.appendWorkNote(taskId, `activity: ${activity}`, "system");
  } else {
    await apiClient.appendWorkNote(
      taskId,
      "activity: review approved; awaiting human confirmation",
      "system",
    );
  }
  console.log(
    `\n✓ Approved task #${taskId} → ${TASK_STATUS.review} (awaiting human)`,
  );
}

async function requestChanges(taskId, summary, activity) {
  if (!summary) {
    console.error("Summary is required (use --summary)");
    return;
  }

  await apiClient.updateTaskStatus(taskId, TASK_STATUS.ready);
  await apiClient.appendWorkNote(taskId, `review:failed: ${summary}`, "system");
  if (activity) {
    await apiClient.appendWorkNote(taskId, `activity: ${activity}`, "system");
  } else {
    await apiClient.appendWorkNote(
      taskId,
      "activity: review completed; decision: changes requested",
      "system",
    );
  }
  console.log(
    `\n✓ Requested changes for task #${taskId} → ${TASK_STATUS.ready}`,
  );
}

async function main() {
  const approveId = parseInt(getArgValue("--approve") || "", 10);
  const requestChangesId = parseInt(getArgValue("--request-changes") || "", 10);
  const summaryArg = getArgValue("--summary");
  const activityArg = getArgValue("--activity");

  if (approveId) {
    await markApproved(approveId, summaryArg, activityArg);
    process.exit(0);
  }

  if (requestChangesId) {
    await requestChanges(requestChangesId, summaryArg, activityArg);
    process.exit(0);
  }

  // Get all tasks via API
  const { tasks } = await apiClient.getTasks();
  
  const reviewTasks = tasks
    .filter((t) => t.status === TASK_STATUS.review)
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));

  const nextTask = reviewTasks.find(
    (task) =>
      !hasCompletedReview(task.work_notes) &&
      !hasRecentReviewComment(task.work_notes),
  );

  if (!nextTask) {
    console.log("=== No Review Tasks ===");
    console.log(
      "All review tasks have recent review notes or none are available.",
    );
    process.exit(0);
  }

  console.log("=== Review Queue ===");
  console.log(`#${nextTask.task_number}: ${nextTask.text}`);
  if (nextTask.notes) {
    console.log(`\nNotes:\n${nextTask.notes}`);
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
  
  console.log("\n=== REVIEW CHECKLIST (MANDATORY) ===");
  console.log("You MUST complete each step before approving:\n");
  console.log("1. RUN: git status -sb  → List all changed/added files.");
  console.log("2. RUN: cat <filepath>  → Read each changed file.");
  console.log(
    "3. RUN: grep -n 'TODO\\|mock\\|placeholder' <filepath>  → Search for incomplete code.",
  );
  console.log("4. VERIFY: Implementation is complete - not a stub or skeleton.");
  console.log("5. TRACE: API → client → UI (all connected?).\n");
  console.log("⚠️  You MUST execute ONE of these commands before exiting:");
  console.log("   - If ANY mock/placeholder/TODO found → --request-changes");
  console.log("   - If ALL code is real and complete  → --approve\n");
  console.log("DO NOT exit without running --approve or --request-changes.");
  console.log("\nCommands:");
  console.log(
    `- Approve: bun review-worker.js --approve ${nextTask.id} --summary "<what was verified>"`,
  );
  console.log(
    `- Request changes: bun review-worker.js --request-changes ${nextTask.id} --summary "<file:line evidence>"`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
