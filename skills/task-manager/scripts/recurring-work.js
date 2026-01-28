#!/usr/bin/env node
/**
 * PHASE 1: CONTEXT-AWARE EXECUTION (Project Logic)
 * Target: Project-Specific Repositories
 * Trigger: Cron (every 3m) - runs AFTER backup.sh
 *
 * Workflow:
 * 1. Check for existing IN-PROGRESS task → Resume work
 * 2. If none, pick oldest READY task → Start work
 *
 * Done/Blocked signals detected via work_notes:
 *   - "status:done" or "status:complete" → Mark completed
 *   - "status:blocked: <reason>" → Mark blocked
 *
 * Environment variables:
 *   DB_PATH - path to tasks.db (default: ~/workspace/data/tasks.db)
 */

import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { Database } from "bun:sqlite";
import { getWorkspacePath } from "../../../scripts/workspace-path.js";
import { appendWorkNote, parseWorkNotes } from "../../../scripts/work-notes.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DB_PATH =
  process.env.DB_PATH || path.join(getWorkspacePath(), "data", "tasks.db");

const STALE_THRESHOLD_MINUTES = 30;

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
  inProgress: resolveStatus("TASK_STATUS_IN_PROGRESS", "in-progress"),
  pending: resolveStatus("TASK_STATUS_PENDING", "pending"),
  blocked: resolveStatus("TASK_STATUS_BLOCKED", "blocked"),
  completed: resolveStatus("TASK_STATUS_COMPLETED", "completed"),
  review: resolveStatus("TASK_STATUS_REVIEW", "review"),
};

// ============================================================================
// UTILITIES
// ============================================================================

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data) {
    console.log(prefix, message, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix, message);
  }
}

function execGit(cwd, args) {
  const command = `git ${args.join(" ")}`;
  try {
    const result = execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: result.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stderr: error.stderr?.toString() || "",
    };
  }
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}

function isGitDirty(cwd) {
  const result = execGit(cwd, ["status", "--porcelain"]);
  return result.success && result.output.length > 0;
}

function gitCommit(cwd, message) {
  execGit(cwd, ["add", "-A"]);
  const commitResult = execGit(cwd, ["commit", "-m", message]);
  return (
    commitResult.success || commitResult.stderr?.includes("nothing to commit")
  );
}

function gitPush(cwd) {
  return execGit(cwd, ["push", "origin", "HEAD"]);
}

// ============================================================================
// WORK NOTE HELPERS
// ============================================================================

/**
 * Check work_notes for done/blocked signals
 * Returns: { done: boolean, blocked: boolean, blockedReason: string | null }
 */
function checkStatusSignals(workNotes) {
  const notes = parseWorkNotes(workNotes);

  // Check most recent notes first (reverse order)
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    const content = (note.content || "").toLowerCase().trim();

    // Done signals
    if (/^status:(done|complete|completed)\b/.test(content)) {
      return { done: true, blocked: false, blockedReason: null };
    }

    // Blocked signals
    if (/^status:blocked\b/.test(content)) {
      const reasonMatch = content.match(/status:blocked[:\s]+(.+)/i);
      const reason = reasonMatch ? reasonMatch[1].trim() : "Unknown blocker";
      return { done: false, blocked: true, blockedReason: reason };
    }
  }

  return { done: false, blocked: false, blockedReason: null };
}

// ============================================================================
// PROJECT HELPERS
// ============================================================================

function getProjectForTask(db, taskId) {
  return db
    .prepare(
      `
    SELECT p.id, p.name, p.local_path, p.workspace_path, p.github_repo_url
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `,
    )
    .get(taskId);
}

function getProjectPath(project) {
  return project?.workspace_path || project?.local_path || null;
}

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

function main() {
  log("info", "=".repeat(60));
  log("info", "Task Worker - Context-Aware Execution");
  log("info", `Database: ${DB_PATH}`);
  log("info", "=".repeat(60));

  // Verify database exists
  if (!fs.existsSync(DB_PATH)) {
    log("error", `Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: false });
  let actionsTaken = [];

  try {
    // ========================================================================
    // CHECK: Is there an existing IN-PROGRESS task?
    // ========================================================================
    const inProgressTask = db
      .prepare(
        `
      SELECT t.id, t.task_number, t.text, t.status, t.project_id, t.work_notes, t.updated_at
      FROM tasks t
      WHERE t.status = ?
      ORDER BY t.updated_at ASC
      LIMIT 1
    `,
      )
      .get(TASK_STATUS.inProgress);

    if (inProgressTask) {
      // ======================================================================
      // YES: RESUME WORK on existing in-progress task
      // ======================================================================
      log(
        "info",
        `Found in-progress task #${inProgressTask.task_number}: ${inProgressTask.text}`,
      );

      const project = inProgressTask.project_id
        ? getProjectForTask(db, inProgressTask.id)
        : null;
      const signals = checkStatusSignals(inProgressTask.work_notes);

      const projectPath = getProjectPath(project);

      // Validate project and path
      if (!project || !projectPath) {
        log(
          "warn",
          `Task #${inProgressTask.task_number} has no valid project path - cannot process git operations`,
        );

        // Still check for done/blocked signals to update status
        if (signals.done) {
          db.prepare(
            `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(TASK_STATUS.completed, inProgressTask.id);
          appendWorkNote(
            db,
            inProgressTask.id,
            `Task marked completed (no project repo)`,
          );
          log(
            "info",
            `Marked task #${inProgressTask.task_number} as COMPLETED (no project)`,
          );
          actionsTaken.push(
            `Completed: #${inProgressTask.task_number} (no project)`,
          );
        } else if (signals.blocked) {
          db.prepare(
            `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(TASK_STATUS.blocked, inProgressTask.id);
          log(
            "info",
            `Marked task #${inProgressTask.task_number} as BLOCKED: ${signals.blockedReason}`,
          );
          actionsTaken.push(
            `Blocked: #${inProgressTask.task_number} - ${signals.blockedReason}`,
          );
        } else {
          log(
            "info",
            `Task #${inProgressTask.task_number} still in-progress (no project assigned)`,
          );
        }
      } else if (!fs.existsSync(projectPath)) {
        log("warn", `Project path does not exist: ${projectPath}`);
      } else if (!isGitRepo(projectPath)) {
        log("warn", `Not a git repository: ${projectPath}`);
      } else {
        // Valid project with git repo
        log("info", `Project: ${project.name} @ ${projectPath}`);

        const updatedAt = inProgressTask.updated_at
          ? new Date(`${inProgressTask.updated_at}Z`)
          : null;
        const minutesInProgress =
          updatedAt && !isNaN(updatedAt.valueOf())
            ? (Date.now() - updatedAt.getTime()) / 1000 / 60
            : null;

        if (
          minutesInProgress !== null &&
          minutesInProgress >= STALE_THRESHOLD_MINUTES
        ) {
          log(
            "warn",
            `Stale task detected (#${inProgressTask.task_number}, ${Math.floor(minutesInProgress)}m). Sanitizing repo...`,
          );
          if (isGitDirty(projectPath)) {
            execGit(projectPath, ["reset", "--hard"]);
            execGit(projectPath, ["clean", "-fd"]);
            appendWorkNote(
              db,
              inProgressTask.id,
              "Stale rescue: repo reset + clean to recover from dirty state.",
            );
            db.prepare(
              "UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(inProgressTask.id);
          }
        }

        const isDirty = isGitDirty(projectPath);

        // Check for done/blocked signals
        if (signals.done) {
          // 100% DONE: Commit, push, mark completed
          log("info", `Task #${inProgressTask.task_number} marked as DONE`);

          const commitMsg = `feat: complete task #${inProgressTask.task_number} - ${inProgressTask.text.substring(0, 50)}`;
          gitCommit(projectPath, commitMsg);
          log("info", `Committed: ${commitMsg}`);

          const pushResult = gitPush(projectPath);
          if (pushResult.success) {
            log("info", `Pushed to remote`);
          } else {
            log("warn", `Push failed: ${pushResult.error}`);
          }

          const doneStatus = TASK_STATUS.review || TASK_STATUS.completed;
          db.prepare(
            `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(doneStatus, inProgressTask.id);

          appendWorkNote(
            db,
            inProgressTask.id,
            `Task ready for review and pushed to remote`,
          );
          actionsTaken.push(
            `Completed: #${inProgressTask.task_number} - ${inProgressTask.text}`,
          );
        } else if (signals.blocked) {
          // BLOCKED: Save progress, mark blocked
          log(
            "info",
            `Task #${inProgressTask.task_number} marked as BLOCKED: ${signals.blockedReason}`,
          );

          if (isDirty) {
            const commitMsg = `wip: task #${inProgressTask.task_number} blocked - ${signals.blockedReason.substring(0, 40)}`;
            gitCommit(projectPath, commitMsg);
            log("info", `Saved WIP commit before blocking`);
          }

          db.prepare(
            `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(TASK_STATUS.blocked, inProgressTask.id);

          appendWorkNote(
            db,
            inProgressTask.id,
            `Task blocked: ${signals.blockedReason}`,
          );
          actionsTaken.push(
            `Blocked: #${inProgressTask.task_number} - ${signals.blockedReason}`,
          );
        } else if (isDirty) {
          // WORK IN PROGRESS: Commit WIP to save progress
          const commitMsg = `wip: continuing task #${inProgressTask.task_number} - ${inProgressTask.text.substring(0, 50)}`;
          gitCommit(projectPath, commitMsg);
          log("info", `WIP commit: ${commitMsg}`);
          actionsTaken.push(`WIP saved: #${inProgressTask.task_number}`);
        } else {
          // No changes, no signals - still working
          log(
            "info",
            `Task #${inProgressTask.task_number} still in-progress (no changes detected)`,
          );
        }
      }
    } else {
      // ======================================================================
      // NO IN-PROGRESS TASK: Check PENDING then READY
      // ======================================================================
      log("info", "No in-progress task found. Checking PENDING queue...");

      // Check PENDING tasks first
      const pendingTask = db
        .prepare(
          `
        SELECT t.id, t.task_number, t.text, t.status, t.project_id, t.work_notes, t.updated_at
        FROM tasks t
        WHERE t.status = ?
        ORDER BY t.updated_at ASC
        LIMIT 1
      `,
        )
        .get(TASK_STATUS.pending);

      if (pendingTask) {
        // Calculate minutes pending
        const updatedAt = new Date(pendingTask.updated_at + "Z");
        const now = new Date();
        const minutesPending = (now - updatedAt) / 1000 / 60;

        log(
          "info",
          `Found pending task #${pendingTask.task_number}: ${pendingTask.text} (${Math.floor(minutesPending)}m)`,
        );

        if (minutesPending >= 5) {
          // 5+ minutes in pending - try to complete
          const project = pendingTask.project_id
            ? getProjectForTask(db, pendingTask.id)
            : null;
          const projectPath = getProjectPath(project);

          if (!project || !projectPath) {
            // No project - cannot complete, update timestamp to reset countdown
            log(
              "warn",
              `Task #${pendingTask.task_number} has no project - skipping (will retry in 5m)`,
            );
            db.prepare(
              `UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            ).run(pendingTask.id);
            actionsTaken.push(
              `Skipped: #${pendingTask.task_number} (no project)`,
            );
          } else if (!fs.existsSync(projectPath)) {
            log("warn", `Project path does not exist: ${projectPath}`);
            db.prepare(
              `UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            ).run(pendingTask.id);
          } else if (!isGitRepo(projectPath)) {
            log("warn", `Not a git repository: ${projectPath}`);
            db.prepare(
              `UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            ).run(pendingTask.id);
          } else {
            // Valid project with git repo - check for changes
            const isDirty = isGitDirty(projectPath);
            const signals = checkStatusSignals(pendingTask.work_notes);

            if (signals.done && isDirty) {
              // Commit and complete
              const commitMsg = `feat: complete task #${pendingTask.task_number} - ${pendingTask.text.substring(0, 50)}`;
              gitCommit(projectPath, commitMsg);
              gitPush(projectPath);
              const doneStatus = TASK_STATUS.review || TASK_STATUS.completed;
              db.prepare(
                `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              ).run(doneStatus, pendingTask.id);
              appendWorkNote(db, pendingTask.id, "Task ready for review");
              log("info", `Completed task #${pendingTask.task_number}`);
              actionsTaken.push(
                `Completed: #${pendingTask.task_number} - ${pendingTask.text}`,
              );
            } else if (signals.done && !isDirty) {
              // Mark complete without commit
              const doneStatus = TASK_STATUS.review || TASK_STATUS.completed;
              db.prepare(
                `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              ).run(doneStatus, pendingTask.id);
              appendWorkNote(db, pendingTask.id, "Task ready for review (no changes)");
              log(
                "info",
                `Completed task #${pendingTask.task_number} (no changes to commit)`,
              );
              actionsTaken.push(
                `Completed: #${pendingTask.task_number} (no changes)`,
              );
            } else if (!signals.done && isDirty) {
              // No done signal but has changes - save WIP and stay pending
              const commitMsg = `wip: task #${pendingTask.task_number} - ${pendingTask.text.substring(0, 50)}`;
              gitCommit(projectPath, commitMsg);
              // Reset timestamp for next retry cycle
              db.prepare(
                `UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              ).run(pendingTask.id);
              log("info", `Saved WIP for task #${pendingTask.task_number}`);
              actionsTaken.push(`WIP saved: #${pendingTask.task_number}`);
            } else {
              // No signals, no changes - reset timestamp for retry
              log(
                "info",
                `Task #${pendingTask.task_number} waiting (no signals, no changes)`,
              );
              db.prepare(
                `UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              ).run(pendingTask.id);
            }
          }
        } else {
          // Less than 5 minutes - wait without resetting the timer
          log(
            "info",
            `Task #${pendingTask.task_number} waiting (${Math.floor(minutesPending)}m/5m)`,
          );
        }
      }

      // If no pending tasks, check READY queue
      if (actionsTaken.length === 0) {
        log("info", "No pending tasks. Checking READY queue...");

        const readyTask = db
          .prepare(
            `
          SELECT t.id, t.task_number, t.text, t.status, t.project_id, t.notes
          FROM tasks t
          WHERE t.status = ?
          ORDER BY t.sort_order ASC, t.id ASC
          LIMIT 1
        `,
          )
          .get(TASK_STATUS.ready);

        if (readyTask) {
          log(
            "info",
            `Picking up task #${readyTask.task_number}: ${readyTask.text}`,
          );

          // Update status to in-progress
          db.prepare(
            `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(TASK_STATUS.inProgress, readyTask.id);

          // Log start with planned approach
          const project = readyTask.project_id
            ? getProjectForTask(db, readyTask.id)
            : null;
          const projectInfo = project
            ? `Project: ${project.name}`
            : "No project assigned";
          const approach = readyTask.notes
            ? readyTask.notes.substring(0, 200)
            : "See task description";

          appendWorkNote(
            db,
            readyTask.id,
            `Started task. ${projectInfo}. Approach: ${approach}`,
          );

          log("info", `Started task #${readyTask.task_number}`);
          actionsTaken.push(
            `Started: #${readyTask.task_number} - ${readyTask.text}`,
          );
        } else {
          log("info", "No READY tasks in queue");
        }
      }
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    log("info", "");
    log("info", "--- Summary ---");
    if (actionsTaken.length > 0) {
      actionsTaken.forEach((action) => log("info", `  ${action}`));
    } else {
      log("info", "  No actions taken");
    }
  } finally {
    db.close();
  }
}

// ============================================================================
// RUN
// ============================================================================

main();
