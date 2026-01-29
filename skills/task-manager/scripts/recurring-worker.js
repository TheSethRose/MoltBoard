#!/usr/bin/env node
/**
 * Recurring Work Agent - Runs in isolated session
 * Finds the next available task respecting dependencies (blocked_by)
 * Does NOT auto-complete or auto-promote - agent controls task lifecycle
 *
 * Uses the MoltBoard API (required for user-based DB isolation).
 *
 * TASK STATUS VALUES (configurable via env; must match API):
 * - backlog: Not ready, waiting to be prioritized
 * - ready: Available to pick up
 * - in-progress: Currently being worked
 * - completed: Finished
 * - blocked: Cannot proceed (has dependencies)
 *
 * USAGE:
 *   bun recurring-worker.js                    # Check task status
 *   bun recurring-worker.js --complete-with-summary <task-id>  # Complete with Final Summary
 *
 * WORK NOTES (work_notes) Usage:
 * - Each task has a work_notes array storing timestamped progress entries
 * - When completing a task, prepend a "Final Summary" note to work_notes
 * - Agent should add progress notes to work_notes before marking complete
 * - work_notes format: { id, content, author: 'agent'|'system'|'human', timestamp }
 * - Server requires work_notes when changing status to 'completed'
 *
 * PROJECT GIT OPERATIONS:
 * - Tasks can be associated with a project via project_id
 * - Use gitInProject(projectPath, ...args) to execute Git commands in project's local_path
 * - Helper checks if directory exists and provides clear error feedback
 */

import fs from "node:fs";
import { execSync } from "node:child_process";
import apiClient from "../../../scripts/api-client.js";

const PROJECT_FILTER = process.env.PROJECT_FILTER;

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
  backlog: resolveStatus("TASK_STATUS_BACKLOG", "backlog"),
  ready: resolveStatus("TASK_STATUS_READY", "ready"),
  inProgress: resolveStatus("TASK_STATUS_IN_PROGRESS", "in-progress"),
  pending: resolveStatus("TASK_STATUS_PENDING", "pending"),
  blocked: resolveStatus("TASK_STATUS_BLOCKED", "blocked"),
  completed: resolveStatus("TASK_STATUS_COMPLETED", "completed"),
  review: resolveStatus("TASK_STATUS_REVIEW", "review"),
};

const REVIEW_STATUS = REVIEW_STATUS_ENV;
const COMPLETE_TARGET_STATUS = REVIEW_STATUS || TASK_STATUS.completed;

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

// Cache for projects
let projectsCache = null;

async function getProjects() {
  if (projectsCache) return projectsCache;
  try {
    const { projects } = await apiClient.getProjects();
    projectsCache = projects || [];
    return projectsCache;
  } catch {
    return [];
  }
}

async function getProjectById(projectId) {
  const projects = await getProjects();
  return projects.find((p) => p.id === projectId) || null;
}

async function getProjectRootForTask(task) {
  if (!task?.project_id) return null;
  const project = await getProjectById(task.project_id);
  if (!project) return null;
  return project.workspace_path || project.local_path || null;
}

// Helper: Execute Git command in project's local_path
// Returns { success: boolean, output: string, error: string }
function gitInProject(localPath, ...args) {
  if (!localPath) {
    return {
      success: false,
      output: "",
      error: "No local_path provided",
    };
  }

  if (!fs.existsSync(localPath)) {
    return {
      success: false,
      output: "",
      error: `Directory does not exist: ${localPath}`,
    };
  }

  try {
    const cmd = ["git", ...args].join(" ");
    const output = execSync(cmd, {
      encoding: "utf8",
      cwd: localPath,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true, output: output.trim(), error: "" };
  } catch (e) {
    return { success: false, output: "", error: e.message };
  }
}

async function getRepoChangeState(task) {
  if (!task?.project_id)
    return { hasRepo: false, hasChanges: false, behind: 0 };
  const project = await getProjectById(task.project_id);
  if (!project) return { hasRepo: false, hasChanges: false, behind: 0 };
  const localPath = project.workspace_path || project.local_path;
  if (!localPath || !fs.existsSync(localPath))
    return { hasRepo: false, hasChanges: false, behind: 0 };

  const statusResult = gitInProject(localPath, "status", "--porcelain");
  const hasChanges = Boolean(
    statusResult.success && statusResult.output.trim(),
  );

  let behind = 0;
  const fetchResult = gitInProject(localPath, "fetch", "origin");
  if (fetchResult.success) {
    const branchResult = gitInProject(
      localPath,
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    );
    const branch = branchResult.success ? branchResult.output.trim() : "main";
    const behindResult = gitInProject(
      localPath,
      "rev-list",
      "--count",
      `HEAD..origin/${branch}`,
    );
    if (behindResult.success) {
      behind = parseInt(behindResult.output.trim(), 10) || 0;
    }
  }

  return { hasRepo: true, hasChanges, behind };
}

// Helper: Check if all blocking tasks are completed
function areDependenciesMet(blockedBy, allTasks) {
  if (!blockedBy || (Array.isArray(blockedBy) && blockedBy.length === 0))
    return true;

  const blockedByArray = Array.isArray(blockedBy)
    ? blockedBy
    : typeof blockedBy === "string"
      ? JSON.parse(blockedBy || "[]")
      : [];

  if (blockedByArray.length === 0) return true;

  // Check if ALL blocking tasks are completed
  const incompleteBlockers = allTasks.filter(
    (t) =>
      blockedByArray.includes(t.task_number) &&
      t.status !== TASK_STATUS.completed,
  );

  return incompleteBlockers.length === 0;
}

// Helper: Get incomplete blocker task numbers for display
function getIncompleteBlockers(blockedBy, allTasks) {
  if (!blockedBy || (Array.isArray(blockedBy) && blockedBy.length === 0))
    return [];

  const blockedByArray = Array.isArray(blockedBy)
    ? blockedBy
    : typeof blockedBy === "string"
      ? JSON.parse(blockedBy || "[]")
      : [];

  if (blockedByArray.length === 0) return [];

  return allTasks.filter(
    (t) =>
      blockedByArray.includes(t.task_number) &&
      t.status !== TASK_STATUS.completed,
  );
}

// Helper: Complete task with Final Summary note prepended
async function completeWithSummary(
  taskId,
  summary,
  targetStatus = COMPLETE_TARGET_STATUS,
) {
  const task = await apiClient.getTask({ id: taskId });
  if (!task) {
    console.error(`[WORKER] ERROR: Task #${taskId} not found`);
    return;
  }

  const taskNum = task.task_number || taskId;

  if (task.status !== TASK_STATUS.inProgress) {
    console.error(
      `[WORKER] ERROR: Task #${taskNum} is not in-progress (current: ${task.status})`,
    );
    return;
  }

  console.log(`[WORKER] ACTION: Completing task #${taskNum}`);
  console.log(`[WORKER] TARGET_STATUS: ${targetStatus}`);

  // Generate Final Summary note
  const statusLabel =
    targetStatus === TASK_STATUS.completed
      ? "completed"
      : `moved to ${targetStatus}`;
  const workNotes = parseWorkNotes(task.work_notes);
  const summaryContent = `✅ Task ${statusLabel}. ${summary ? `Summary: ${summary}` : `Total progress entries: ${workNotes.length}`}`;

  // Add summary note and update status via API
  await apiClient.appendWorkNote(taskId, summaryContent, "system");
  await apiClient.updateTaskStatus(taskId, targetStatus);

  console.log(`[WORKER] SUMMARY: ${summaryContent}`);
  console.log(`[WORKER] RESULT: Task #${taskNum} → ${targetStatus}`);
}

async function blockTask(taskId, reason, activity) {
  const task = await apiClient.getTask({ id: taskId });
  if (!task) {
    console.error(`[WORKER] ERROR: Task #${taskId} not found`);
    return;
  }

  const taskNum = task.task_number || taskId;

  if (!reason) {
    console.error("[WORKER] ERROR: Block reason is required (use --reason)");
    return;
  }

  console.log(`[WORKER] ACTION: Blocking task #${taskNum}`);
  console.log(`[WORKER] REASON: ${reason}`);

  await apiClient.appendWorkNote(taskId, `status:blocked: ${reason}`, "system");
  if (activity) {
    await apiClient.appendWorkNote(taskId, `activity: ${activity}`, "system");
    console.log(`[WORKER] ACTIVITY: ${activity}`);
  }
  await apiClient.updateTaskStatus(taskId, TASK_STATUS.blocked);

  console.log(`[WORKER] RESULT: Task #${taskNum} → ${TASK_STATUS.blocked}`);
}

async function main() {
  console.log(`[WORKER] START: ${new Date().toISOString()}`);

  // Get all tasks via API
  const { tasks } = await apiClient.getTasks();

  // Apply project filter
  const filteredTasks =
    PROJECT_FILTER && PROJECT_FILTER !== "all"
      ? tasks.filter((t) => t.project_id === parseInt(PROJECT_FILTER))
      : tasks;

  // Get task counts
  const counts = {
    backlog: filteredTasks.filter((t) => t.status === TASK_STATUS.backlog)
      .length,
    ready: filteredTasks.filter((t) => t.status === TASK_STATUS.ready).length,
    in_progress: filteredTasks.filter((t) => t.status === TASK_STATUS.inProgress)
      .length,
    blocked: filteredTasks.filter((t) => t.status === TASK_STATUS.blocked)
      .length,
    completed: filteredTasks.filter((t) => t.status === TASK_STATUS.completed)
      .length,
  };

  console.log(`[WORKER] STATUS: backlog=${counts.backlog} ready=${counts.ready} in_progress=${counts.in_progress} blocked=${counts.blocked} completed=${counts.completed}`);
  if (PROJECT_FILTER && PROJECT_FILTER !== "all") {
    console.log(`[WORKER] FILTER: project=${PROJECT_FILTER}`);
  }

  const completeTaskId = parseInt(
    getArgValue("--complete-with-summary") || "",
    10,
  );
  const completeForReviewId = parseInt(
    getArgValue("--complete-for-review") || "",
    10,
  );
  const blockTaskId = parseInt(getArgValue("--block") || "", 10);
  const summaryArg = getArgValue("--summary");
  const reasonArg = getArgValue("--reason");
  const activityArg = getArgValue("--activity");

  if (completeTaskId) {
    await completeWithSummary(completeTaskId, summaryArg, COMPLETE_TARGET_STATUS);
    process.exit(0);
  }

  if (completeForReviewId) {
    await completeWithSummary(
      completeForReviewId,
      summaryArg,
      REVIEW_STATUS || COMPLETE_TARGET_STATUS,
    );
    process.exit(0);
  }

  if (blockTaskId) {
    await blockTask(blockTaskId, reasonArg, activityArg);
    process.exit(0);
  }

  // Check for currently in-progress task
  const inProgressTasks = filteredTasks
    .filter((t) => t.status === TASK_STATUS.inProgress)
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));

  const currentTask = inProgressTasks[0];

  const STUCK_THRESHOLD_MINUTES = 10;

  if (currentTask) {
    const updatedAt = new Date(currentTask.updated_at);
    const now = new Date();
    const minutesInProgress = Math.round((now - updatedAt) / 1000 / 60);
    const projectRoot = await getProjectRootForTask(currentTask);

    console.log(`[WORKER] IN_PROGRESS: Task #${currentTask.task_number} (id=${currentTask.id})`);
    console.log(`[WORKER] TITLE: ${currentTask.text}`);
    console.log(`[WORKER] DURATION: ${minutesInProgress} min`);
    if (projectRoot) {
      console.log(`[WORKER] PROJECT: ${projectRoot}`);
    }
    }
    if (currentTask.notes) {
      console.log(
        `Notes: ${currentTask.notes.substring(0, 200)}${currentTask.notes.length > 200 ? "..." : ""}`,
      );
    }

    const recentNotes = parseWorkNotes(currentTask.work_notes).slice(-10);
    if (recentNotes.length > 0) {
      console.log("\nRecent Work Notes:");
      recentNotes.forEach((note) => {
        const author = note.author || "system";
        const ts = note.timestamp || "";
        const content = note.content || "";
        console.log(`- [${author}] ${ts} ${content}`.trim());
      });
    }

    // Check for work_notes/progress details
    const workNotes = parseWorkNotes(currentTask.work_notes);
    const meaningfulNotes = workNotes.filter((note) => {
      if (!note || typeof note.content !== "string") return false;
      const content = note.content;
      if (content.startsWith("Started work on task.")) return false;
      if (content.startsWith("Sandbox: ")) return false;
      return true;
    });
    const hasProgressDetails = meaningfulNotes.length > 0;

    if (!hasProgressDetails) {
      await apiClient.appendWorkNote(
        currentTask.id,
        "Started work on task.",
        "system",
      );
    }

    if (minutesInProgress >= STUCK_THRESHOLD_MINUTES) {
      console.log(`\n⚠️  STUCK TASK DETECTED`);
      console.log(
        `This task has been in progress for ${minutesInProgress} minutes.`,
      );
      console.log(`Progress entries: ${workNotes.length}`);

      if (!hasProgressDetails) {
        const repoState = await getRepoChangeState(currentTask);
        if (repoState.hasRepo && (repoState.hasChanges || repoState.behind > 0)) {
          await apiClient.appendWorkNote(
            currentTask.id,
            `Stale check: repo has ${repoState.hasChanges ? "uncommitted changes" : ""}${repoState.hasChanges && repoState.behind > 0 ? " and " : ""}${repoState.behind > 0 ? `${repoState.behind} commit(s) behind origin` : ""}. Keeping in-progress.`,
            "system",
          );
        } else {
          await apiClient.appendWorkNote(
            currentTask.id,
            `Stale check: no progress notes after ${minutesInProgress} minutes and no repo changes. Agent should resume work in-place.`,
            "system",
          );
        }
      }

      if (!hasProgressDetails) {
        console.log("\n⚠️  WARNING: No work_notes found!");
        console.log("This task has no progress tracking. Before completing:");
        console.log("1. Add work_notes entries documenting your progress");
        console.log(
          "2. Run: bun recurring-worker.js --complete-with-summary <task-id>",
        );
      }

      console.log("");
      console.log("=== AGENT INSTRUCTIONS ===");
      console.log("1. Check if this task is actually complete");
      console.log("2. If complete:");
      if (hasProgressDetails) {
        console.log(
          "   - Run: bun recurring-worker.js --complete-with-summary " +
            currentTask.id +
            (REVIEW_STATUS ? ' --summary "<summary>"' : ""),
        );
        console.log(
          REVIEW_STATUS
            ? `   - This will prepend a "Final Summary" and move to ${REVIEW_STATUS}`
            : '   - This will prepend a "Final Summary" and mark complete',
        );
      } else {
        console.log("   - FIRST: Add work_notes entries documenting progress");
        console.log(
          "   - THEN: Run: bun recurring-worker.js --complete-with-summary " +
            currentTask.id +
            (REVIEW_STATUS ? ' --summary "<summary>"' : ""),
        );
      }
      console.log(
        "3. If not complete: continue working on it (stay in-progress)",
      );
      console.log("");
      console.log("→ Do NOT pick up new ready tasks until this one is resolved.");
    } else {
      console.log("");
      console.log(
        `→ Complete this task before picking up a new one (${STUCK_THRESHOLD_MINUTES - minutesInProgress} min until stuck detection).`,
      );
      if (!hasProgressDetails) {
        console.log("→ TIP: Add work_notes as you work for progress tracking.");
      }
    }

    process.exit(0);
  }

  // No task in progress - find next available task from Ready queue
  const readyTasks = filteredTasks
    .filter((t) => t.status === TASK_STATUS.ready)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

  if (readyTasks.length === 0) {
    console.log("[WORKER] SKIP: No tasks in Ready queue");
    if (counts.backlog > 0) {
      console.log(`[WORKER] NOTE: ${counts.backlog} task(s) in Backlog need grooming`);
    }
    console.log(`[WORKER] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  // Find first task with met dependencies
  const nextTask = readyTasks.find((task) =>
    areDependenciesMet(task.blocked_by, filteredTasks),
  );

  // Auto-pickup mode (for cron workers)
  const isAutoMode = process.argv.includes("--auto");

  if (isAutoMode && nextTask) {
    console.log(`[WORKER] AUTO_PICKUP: Task #${nextTask.task_number} (id=${nextTask.id})`);
    console.log(`[WORKER] TITLE: ${nextTask.text}`);

    // Pick up the task
    await apiClient.updateTaskStatus(nextTask.id, TASK_STATUS.inProgress);
    await apiClient.appendWorkNote(
      nextTask.id,
      `Started: Auto-picked up from cron worker`,
      "system",
    );

    console.log(`[WORKER] ACTION: Picked up task`);
    console.log(`[WORKER] RESULT: Task #${nextTask.task_number} → ${TASK_STATUS.inProgress}`);
    console.log(`[WORKER] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  if (!nextTask) {
    // All ready tasks are blocked
    console.log("[WORKER] BLOCKED: All ready tasks have unmet dependencies");
    for (const task of readyTasks.slice(0, 5)) {
      const blockers = getIncompleteBlockers(task.blocked_by, filteredTasks);
      console.log(`[WORKER]   #${task.task_number} blocked by: ${blockers.map((b) => `#${b.task_number}`).join(", ")}`);
    }
    console.log(`[WORKER] END: ${new Date().toISOString()}`);
    process.exit(0);
  }

  // Found an available task - display it
  console.log("=== Next Available Task ===");
  console.log(`#${nextTask.task_number}: ${nextTask.text}`);
  console.log(`Priority: ${nextTask.priority || "none"}`);

  const nextProjectRoot = await getProjectRootForTask(nextTask);
  if (nextProjectRoot) {
    console.log(`Project Root: ${nextProjectRoot}`);
    console.log("→ Work ONLY inside the Project Root (set CWD there).");
  }

  const tags = Array.isArray(nextTask.tags)
    ? nextTask.tags
    : JSON.parse(nextTask.tags || "[]");
  if (tags.length > 0) {
    console.log(`Tags: ${tags.join(", ")}`);
  }

  if (nextTask.notes) {
    console.log(`\nDescription:\n${nextTask.notes}`);
  }

  const nextTaskNotes = parseWorkNotes(nextTask.work_notes).slice(-10);
  if (nextTaskNotes.length > 0) {
    console.log("\nRecent Work Notes:");
    nextTaskNotes.forEach((note) => {
      const author = note.author || "system";
      const ts = note.timestamp || "";
      const content = note.content || "";
      console.log(`- [${author}] ${ts} ${content}`.trim());
    });
  }

  // Show blocked tasks waiting on this one
  const waitingOnThis = filteredTasks.filter((t) => {
    if (t.status !== TASK_STATUS.ready) return false;
    const blockedBy = Array.isArray(t.blocked_by)
      ? t.blocked_by
      : JSON.parse(t.blocked_by || "[]");
    return blockedBy.includes(nextTask.task_number);
  });

  if (waitingOnThis.length > 0) {
    console.log(
      `\n⏳ ${waitingOnThis.length} task(s) waiting on this to complete:`,
    );
    waitingOnThis.forEach((t) => console.log(`  #${t.task_number}: ${t.text}`));
  }

  console.log(
    `\n→ To work on this task, update its status to "${TASK_STATUS.inProgress}"`,
  );
  console.log(
    "   For tasks returning from stuck state, check if complete first.",
  );
  console.log("\n=== AGENT PROMPT (STRICT) ===");
  console.log("ROLE: Execution agent for this single task.");
  console.log("GOAL: Complete the task exactly as requested.");
  console.log("CONSTRAINTS:");
  console.log("1) Work ONLY inside the Project Root shown above (sandbox).");
  console.log("2) Use relative paths; no writes outside sandbox.");
  console.log(
    "3) Update work_notes throughout the process (progress + decisions).",
  );
  console.log(
    '4) If blocked or unclear, use --block <taskId> --reason "..." --activity "...".',
  );
  console.log(
    "5) If you commit, run git from the Project Root (CWD), not the workspace root.",
  );
  console.log("PROCESS:");
  console.log('- Start with a short plan in work_notes: "Started: <short plan>"');
  console.log(
    '- Make changes in small steps; log each change: "Progress: <what changed>"',
  );
  console.log('- Record key decisions: "Decision: <why>"');
  console.log('- If blocked or ambiguous, log "Blocked: <reason>" and stop.');
  console.log("RESEARCH (only if needed):");
  console.log("- Use MoltDocs for current docs.");
  console.log(
    "- Use notebooklm-skill (ID: 132520db-e751-4ea2-9512-d2b9418c8ecb).",
  );
  console.log("- Use Agent-Browser only for live checks.");
  console.log("VERIFICATION (before marking done):");
  console.log("- Confirm all changes are inside Project Root.");
  console.log(
    "- Confirm git status is clean or changes are committed from Project Root.",
  );
  console.log('- Add "status:done" to work_notes when complete.');
  console.log("OUTPUT FORMAT (work_notes entries):");
  console.log("- Started: <short plan>");
  console.log("- Progress: <what changed>");
  console.log("- Decision: <why>");
  console.log("- Blocked: <reason>");
  console.log("- Done: status:done");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
