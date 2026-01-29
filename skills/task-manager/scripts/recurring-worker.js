#!/usr/bin/env node
/**
 * Recurring Work Agent - Runs in isolated session
 * Finds the next available task respecting dependencies (blocked_by)
 * Does NOT auto-complete or auto-promote - agent controls task lifecycle
 *
 * TASK STATUS VALUES (configurable via env; must match API):
 * - backlog: Not ready, waiting to be prioritized
 * - ready: Available to pick up
 * - in-progress: Currently being worked
 * - completed: Finished
 * - blocked: Cannot proceed (has dependencies)
 *
 * USAGE:
 *   node recurring-worker.js                    # Check task status
 *   node recurring-worker.js --complete-with-summary <task-id>  # Complete with Final Summary
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
 * - Use gitInProject(projectId, ...args) to execute Git commands in project's local_path
 * - Helper checks if directory exists and provides clear error feedback
 * - Use commitToProject(task) to auto-commit task completion to project repo
 */

import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { Database } from "bun:sqlite";
import { getDbPath } from "../../../scripts/workspace-path.js";
import { appendWorkNote, parseWorkNotes } from "../../../scripts/work-notes.js";

const DB_PATH = getDbPath();
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

// Ensure database exists
if (!fs.existsSync(DB_PATH)) {
  console.log("No tasks database found");
  process.exit(0);
}

const db = new Database(DB_PATH);

// Helper: Get project by ID
function getProjectById(projectId) {
  try {
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  } catch {
    return null;
  }
}

function getProjectRootForTask(task) {
  if (!task?.project_id) return null;
  const project = getProjectById(task.project_id);
  if (!project) return null;
  return project.workspace_path || project.local_path || null;
}

function appendWorkNoteIfMissing(taskId, marker, content, author = "system") {
  const task = db
    .prepare("SELECT work_notes FROM tasks WHERE id = ?")
    .get(taskId);
  if (!task) return;
  const existingNotes = parseWorkNotes(task.work_notes);
  const hasMarker = existingNotes.some(
    (note) =>
      typeof note?.content === "string" && note.content.includes(marker),
  );
  if (hasMarker) return;
  appendWorkNote(db, taskId, content, author);
}

function getRepoChangeState(task) {
  if (!task?.project_id)
    return { hasRepo: false, hasChanges: false, behind: 0 };
  const project = getProjectById(task.project_id);
  if (!project) return { hasRepo: false, hasChanges: false, behind: 0 };
  const localPath = project.workspace_path || project.local_path;
  if (!localPath || !fs.existsSync(localPath))
    return { hasRepo: false, hasChanges: false, behind: 0 };

  const statusResult = gitInProject(task.project_id, "status", "--porcelain");
  const hasChanges = Boolean(
    statusResult.success && statusResult.output.trim(),
  );

  let behind = 0;
  const fetchResult = gitInProject(task.project_id, "fetch", "origin");
  if (fetchResult.success) {
    const branchResult = gitInProject(
      task.project_id,
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    );
    const branch = branchResult.success ? branchResult.output.trim() : "main";
    const behindResult = gitInProject(
      task.project_id,
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

// Helper: Execute Git command in project's local_path
// Returns { success: boolean, output: string, error: string }
function gitInProject(projectId, ...args) {
  const project = getProjectById(projectId);

  if (!project) {
    return {
      success: false,
      output: "",
      error: `Project ${projectId} not found`,
    };
  }

  const localPath = project.workspace_path || project.local_path;

  if (!localPath) {
    return {
      success: false,
      output: "",
      error: `Project ${projectId} has no local_path`,
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

// Build WHERE clause for project filtering
function getProjectFilterClause() {
  if (PROJECT_FILTER && PROJECT_FILTER !== "all") {
    return `AND project_id = ${parseInt(PROJECT_FILTER)}`;
  }
  return "";
}

// Helper: Check if all blocking tasks are completed
function areDependenciesMet(blockedByJson) {
  if (!blockedByJson || blockedByJson === "[]") return true;

  try {
    const blockedBy = JSON.parse(blockedByJson);
    if (!Array.isArray(blockedBy) || blockedBy.length === 0) return true;

    // Check if ALL blocking tasks are completed
    const placeholders = blockedBy.map(() => "?").join(",");
    const incompleteBlockers = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM tasks
      WHERE task_number IN (${placeholders})
      AND status != ?
    `,
      )
      .get(...blockedBy, TASK_STATUS.completed);

    return incompleteBlockers.count === 0;
  } catch {
    return true; // If JSON parsing fails, assume no blockers
  }
}

// Helper: Get incomplete blocker task numbers for display
function getIncompleteBlockers(blockedByJson) {
  if (!blockedByJson || blockedByJson === "[]") return [];

  try {
    const blockedBy = JSON.parse(blockedByJson);
    if (!Array.isArray(blockedBy) || blockedBy.length === 0) return [];

    const placeholders = blockedBy.map(() => "?").join(",");
    const blockers = db
      .prepare(
        `
      SELECT task_number, text FROM tasks
      WHERE task_number IN (${placeholders})
      AND status != ?
    `,
      )
      .all(...blockedBy, TASK_STATUS.completed);

    return blockers;
  } catch {
    return [];
  }
}

// Helper: Complete task with Final Summary note prepended
function completeWithSummary(
  taskId,
  summary,
  targetStatus = COMPLETE_TARGET_STATUS,
) {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    console.error(`Task #${taskId} not found`);
    return;
  }

  if (task.status !== TASK_STATUS.inProgress) {
    console.error(
      `Task #${taskId} is not in-progress (current: ${task.status})`,
    );
    return;
  }

  // Parse existing work_notes
  const workNotes = parseWorkNotes(task.work_notes);

  // Generate Final Summary note
  const statusLabel =
    targetStatus === TASK_STATUS.completed
      ? "completed"
      : `moved to ${targetStatus}`;
  const finalSummary = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    content: `✅ Task ${statusLabel}. ${summary ? `Summary: ${summary}` : `Total progress entries: ${workNotes.length}`}`,
    author: "system",
    timestamp: new Date().toISOString(),
  };

  // Prepend Final Summary to work_notes
  const updatedNotes = [finalSummary, ...workNotes];

  // Update task
  db.prepare(
    "UPDATE tasks SET status = ?, work_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(targetStatus, JSON.stringify(updatedNotes), taskId);

  console.log(`\n✓ Updated task #${task.task_number} with Final Summary`);
  console.log(`  Final Summary: ${finalSummary.content}`);
  console.log(`  Total work_notes: ${updatedNotes.length}`);

  // Update blockers
  if (targetStatus === TASK_STATUS.completed) {
    updateBlockersForTask(taskId);
  }
}

function blockTask(taskId, reason, activity) {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    console.error(`Task #${taskId} not found`);
    return;
  }

  if (!reason) {
    console.error("Block reason is required (use --reason)");
    return;
  }

  const workNotes = parseWorkNotes(task.work_notes);
  const newNotes = [
    ...workNotes,
    {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      content: `status:blocked: ${reason}`,
      author: "system",
      timestamp: new Date().toISOString(),
    },
  ];

  if (activity) {
    newNotes.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      content: `activity: ${activity}`,
      author: "system",
      timestamp: new Date().toISOString(),
    });
  }

  db.prepare(
    "UPDATE tasks SET status = ?, work_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(TASK_STATUS.blocked, JSON.stringify(newNotes), taskId);

  console.log(`\n✓ Blocked task #${task.task_number}: ${reason}`);
}

// Helper: Append a work note to a task
// Helper: Update tasks that had this task as a blocker
function updateBlockersForTask(completedTaskId) {
  const blockedTasks = db
    .prepare("SELECT * FROM tasks WHERE blocked_by LIKE ?")
    .all(`%${completedTaskId}%`);

  blockedTasks.forEach((blockedTask) => {
    const blockers = JSON.parse(blockedTask.blocked_by || "[]");
    const newBlockers = blockers.filter((id) => id !== completedTaskId);

    if (newBlockers.length === 0) {
      if (blockedTask.status === TASK_STATUS.blocked) {
        db.prepare(
          "UPDATE tasks SET blocked_by = ?, status = ? WHERE id = ?",
        ).run("[]", TASK_STATUS.ready, blockedTask.id);
        console.log(
          `→ Unblocked and moved to ready: #${blockedTask.task_number}`,
        );
      }
    }
  });
}

// Get task counts
const counts = db
  .prepare(
    `
  SELECT
    SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as backlog,
    SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as ready,
    SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as in_progress,
    SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as completed
  FROM tasks
  WHERE 1=1 ${getProjectFilterClause()}
`,
  )
  .get(
    TASK_STATUS.backlog,
    TASK_STATUS.ready,
    TASK_STATUS.inProgress,
    TASK_STATUS.blocked,
    TASK_STATUS.completed,
  );

console.log("=== Task Status ===");
console.log(
  `Backlog: ${counts.backlog || 0} | Ready: ${counts.ready || 0} | In Progress: ${counts.in_progress || 0} | Blocked: ${counts.blocked || 0} | Completed: ${counts.completed || 0}`,
);
if (PROJECT_FILTER && PROJECT_FILTER !== "all") {
  console.log(`(Filtered by project: ${PROJECT_FILTER})`);
}
console.log("");

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
  completeWithSummary(completeTaskId, summaryArg, COMPLETE_TARGET_STATUS);
  db.close();
  process.exit(0);
}

if (completeForReviewId) {
  completeWithSummary(
    completeForReviewId,
    summaryArg,
    REVIEW_STATUS || COMPLETE_TARGET_STATUS,
  );
  db.close();
  process.exit(0);
}

if (blockTaskId) {
  blockTask(blockTaskId, reasonArg, activityArg);
  db.close();
  process.exit(0);
}

// Check for currently in-progress task
const currentTask = db
  .prepare(
    `
  SELECT id, task_number, text, notes, work_notes, priority, tags, updated_at
  FROM tasks
  WHERE status = ? ${getProjectFilterClause()}
  ORDER BY updated_at ASC
  LIMIT 1
`,
  )
  .get(TASK_STATUS.inProgress);

const STUCK_THRESHOLD_MINUTES = 10; // Flag as stuck after this long

if (currentTask) {
  const updatedAt = new Date(currentTask.updated_at + "Z");
  const now = new Date();
  const minutesInProgress = Math.round((now - updatedAt) / 1000 / 60);
  const projectRoot = getProjectRootForTask(currentTask);

  console.log("=== Currently In Progress ===");
  console.log(`#${currentTask.task_number}: ${currentTask.text}`);
  console.log(
    `Priority: ${currentTask.priority || "none"} | Time: ${minutesInProgress} min`,
  );
  if (projectRoot) {
    console.log(`Project Root: ${projectRoot}`);
    console.log("→ Work ONLY inside the Project Root (set CWD there).");
    try {
      if (process.cwd() !== projectRoot) {
        process.chdir(projectRoot);
      }
      appendWorkNoteIfMissing(
        currentTask.id,
        "Sandbox: ",
        `Sandbox: ${projectRoot}. All file operations must stay within this path.`,
        "system",
      );
    } catch {
      appendWorkNote(
        db,
        currentTask.id,
        `Sandbox warning: unable to set CWD to ${projectRoot}. Current CWD: ${process.cwd()}`,
        "system",
      );
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
    appendWorkNote(db, currentTask.id, "Started work on task.");
  }

  if (minutesInProgress >= STUCK_THRESHOLD_MINUTES) {
    // Task has been in progress too long - flag for agent to check
    console.log(`\n⚠️  STUCK TASK DETECTED`);
    console.log(
      `This task has been in progress for ${minutesInProgress} minutes.`,
    );
    console.log(`Progress entries: ${workNotes.length}`);

    if (!hasProgressDetails) {
      const repoState = getRepoChangeState(currentTask);
      if (repoState.hasRepo && (repoState.hasChanges || repoState.behind > 0)) {
        appendWorkNoteIfMissing(
          currentTask.id,
          "Stale check: repo active",
          `Stale check: repo has ${repoState.hasChanges ? "uncommitted changes" : ""}${repoState.hasChanges && repoState.behind > 0 ? " and " : ""}${repoState.behind > 0 ? `${repoState.behind} commit(s) behind origin` : ""}. Keeping in-progress.`,
          "system",
        );
      } else {
        appendWorkNoteIfMissing(
          currentTask.id,
          "Stale check: no progress",
          `Stale check: no progress notes after ${minutesInProgress} minutes and no repo changes. Agent should resume work in-place.`,
          "system",
        );
        db.prepare(
          "UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(currentTask.id);
      }
    }

    if (!hasProgressDetails) {
      console.log("\n⚠️  WARNING: No work_notes found!");
      console.log("This task has no progress tracking. Before completing:");
      console.log("1. Add work_notes entries documenting your progress");
      console.log(
        "2. Run: node scripts/recurring-worker.js --complete-with-summary <task-id>",
      );
    }

    console.log("");
    console.log("=== AGENT INSTRUCTIONS ===");
    console.log("1. Check if this task is actually complete");
    console.log("2. If complete:");
    if (hasProgressDetails) {
      console.log(
        "   - Run: node scripts/recurring-worker.js --complete-with-summary " +
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
        "   - THEN: Run: node scripts/recurring-worker.js --complete-with-summary " +
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

  // Handle --complete-with-summary flag for automatic completion with Final Summary
  if (process.argv.includes("--complete-with-summary")) {
    const taskId = parseInt(
      process.argv[process.argv.indexOf("--complete-with-summary") + 1],
    );
    if (taskId) {
      completeWithSummary(taskId);
      db.close();
      process.exit(0);
    }
  }

  db.close();
  process.exit(0);
}

// No task in progress - find next available task from Ready queue
const readyTasks = db
  .prepare(
    `
  SELECT id, task_number, text, notes, priority, tags, sort_order, blocked_by
  FROM tasks
  WHERE status = ? ${getProjectFilterClause()}
  ORDER BY sort_order ASC, id ASC
`,
  )
  .all(TASK_STATUS.ready);

if (readyTasks.length === 0) {
  console.log("=== No Ready Tasks ===");
  console.log("All caught up! No tasks in the Ready queue.");

  if (counts.backlog > 0) {
    console.log(
      `\n${counts.backlog} task(s) waiting in Backlog. Move them to Ready when prepared.`,
    );
  }
  db.close();
  process.exit(0);
}

// Find first task with met dependencies
const nextTask = readyTasks.find((task) => areDependenciesMet(task.blocked_by));

if (!nextTask) {
  // All ready tasks are blocked
  console.log("=== All Ready Tasks Blocked ===");
  console.log("Tasks in Ready queue are waiting on dependencies:\n");

  for (const task of readyTasks.slice(0, 5)) {
    const blockers = getIncompleteBlockers(task.blocked_by);
    console.log(`#${task.task_number}: ${task.text}`);
    console.log(
      `  Blocked by: ${blockers.map((b) => `#${b.task_number}`).join(", ")}`,
    );
  }

  db.close();
  process.exit(0);
}

// Found an available task - display it
console.log("=== Next Available Task ===");
console.log(`#${nextTask.task_number}: ${nextTask.text}`);
console.log(`Priority: ${nextTask.priority || "none"}`);

const nextProjectRoot = getProjectRootForTask(nextTask);
if (nextProjectRoot) {
  console.log(`Project Root: ${nextProjectRoot}`);
  console.log("→ Work ONLY inside the Project Root (set CWD there).");
}

const tags = JSON.parse(nextTask.tags || "[]");
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
const waitingOnThis = db
  .prepare(
    `
  SELECT task_number, text FROM tasks
  WHERE status = ?
  AND blocked_by LIKE ? ${getProjectFilterClause()}
`,
  )
  .all(TASK_STATUS.ready, `%${nextTask.task_number}%`);

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

db.close();
