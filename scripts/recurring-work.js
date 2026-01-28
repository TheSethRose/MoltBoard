#!/usr/bin/env node

/**
 * DASHBOARD BACKGROUND SERVICES
 * Trigger: Continuous Interval (Dashboard Process)
 *
 * This worker runs continuously and performs:
 *
 * SERVICE A: INGESTION (Every 15m)
 *   - GitHub Sync Engine -> Insert "Backlog" Tasks
 *   - Fetches open issues from GitHub repos and creates tasks
 *
 * SERVICE B: COMPLETION WATCHER (Every 30s)
 *   - Automated Git Push (Safety net for manual completions)
 *   - Scans for 'Completed' tasks with project_id
 *   - Git add/commit/push to project repo if uncommitted changes exist
 *
 * NOTE: This worker does NOT change task status (that's the cron worker's job).
 *       It only ingests new tasks and ensures completed work is pushed.
 *
 * Run with: node scripts/recurring-work.js
 * Or use PM2: pm2 start scripts/recurring-work.js --name "dashboard-worker"
 *
 * Environment variables:
 *   DB_PATH - path to tasks.db (default: ~/workspace/data/tasks.db)
 *   GITHUB_TOKEN - GitHub API token for issue sync
 */

import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import workspacePath from "./workspace-path.js";
import { appendWorkNote } from "./work-notes.js";

const { getWorkspacePath } = workspacePath;

// Configuration
const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const TASK_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
const DB_PATH =
  process.env.DB_PATH || path.join(getWorkspacePath(), "data", "tasks.db");

// Track processed completed tasks to avoid duplicate git operations
const processedCompletedTasks = new Set();

// GitHub rate limit tracking
let githubRateLimitUntil = null;
let githubRateLimitRemaining = null;

/**
 * Check if we're currently rate limited by GitHub
 */
function isGitHubRateLimited() {
  if (!githubRateLimitUntil) return false;
  if (Date.now() >= githubRateLimitUntil) {
    githubRateLimitUntil = null;
    return false;
  }
  return true;
}

/**
 * Get seconds until rate limit resets
 */
function getRateLimitRetryAfter() {
  if (!githubRateLimitUntil) return null;
  return Math.ceil((githubRateLimitUntil - Date.now()) / 1000);
}

/**
 * Parse rate limit headers from GitHub response
 */
function parseRateLimitHeaders(headers) {
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");

  if (remaining !== null) {
    githubRateLimitRemaining = parseInt(remaining, 10);
  }

  if (
    reset !== null &&
    githubRateLimitRemaining !== null &&
    githubRateLimitRemaining <= 0
  ) {
    githubRateLimitUntil = parseInt(reset, 10) * 1000;
  }
}

/**
 * Get database connection
 */
function getDb() {
  return new Database(DB_PATH);
}

/**
 * Log with timestamp
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (data) {
    console.log(logMsg, JSON.stringify(data, null, 2));
  } else {
    console.log(logMsg);
  }
}

/**
 * Parse GitHub repo URL to extract owner and repo
 */
function parseGitHubUrl(repoUrl) {
  if (!repoUrl) return null;

  // Handle various URL formats
  if (repoUrl.includes("github.com/")) {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ""),
      };
    }
  } else if (repoUrl.includes(":")) {
    // SSH format: git@github.com:owner/repo.git
    const match = repoUrl.match(/:([^\/]+)\/(.+)$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ""),
      };
    }
  }

  return null;
}

/**
 * Fetch GitHub issues for a project and sync to tasks
 */
async function syncGitHubIssues(db, project) {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    log(
      "warn",
      `Skipping sync for project ${project.id}: GITHUB_TOKEN not set`,
    );
    return { created: 0, updated: 0, skipped: true };
  }

  // Check if we're rate limited before making any requests
  if (isGitHubRateLimited()) {
    const retryAfter = getRateLimitRetryAfter();
    log(
      "warn",
      `Skipping sync for project ${project.id}: GitHub rate limited (retry in ${retryAfter}s)`,
    );
    return { created: 0, updated: 0, rateLimited: true, retryAfter };
  }

  const parsed = parseGitHubUrl(project.github_repo_url);
  if (!parsed) {
    log(
      "warn",
      `Could not parse GitHub URL for project ${project.id}: ${project.github_repo_url}`,
    );
    return { created: 0, updated: 0, error: "Invalid URL" };
  }

  const { owner, repo } = parsed;
  const repoFullName = `${owner}/${repo}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Dashboard-Worker/1.0",
        },
      },
    );

    // Parse rate limit headers from every response
    parseRateLimitHeaders(response.headers);

    // Handle rate limit responses
    if (response.status === 403 || response.status === 429) {
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const resetTime = resetHeader
        ? parseInt(resetHeader, 10) * 1000
        : Date.now() + 60000;
      githubRateLimitUntil = resetTime;

      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      log(
        "warn",
        `GitHub rate limit hit for ${owner}/${repo}. Retry in ${retryAfter}s`,
      );
      return { created: 0, updated: 0, rateLimited: true, retryAfter };
    }

    if (!response.ok) {
      const errorText = await response.text();
      log(
        "error",
        `GitHub API error for ${owner}/${repo}: ${response.status}`,
        { error: errorText },
      );
      return { created: 0, updated: 0, error: `GitHub API ${response.status}` };
    }

    // Clear rate limit state on successful response
    if (githubRateLimitRemaining && githubRateLimitRemaining > 10) {
      githubRateLimitUntil = null;
    }

    const issues = await response.json();

    if (!Array.isArray(issues)) {
      log("error", `Invalid response from GitHub for ${owner}/${repo}`);
      return { created: 0, updated: 0, error: "Invalid response" };
    }

    let created = 0;
    let updated = 0;

    for (const issue of issues) {
      // Skip pull requests
      if (issue.pull_request) continue;

      const issueNumber = issue.number;
      const title = issue.title;
      const body = issue.body || "";
      const labels = issue.labels?.map((l) => l.name).filter(Boolean) || [];

      // Check if task with this github_issue_id exists for this project
      const existingTask = db
        .prepare(
          "SELECT * FROM tasks WHERE github_issue_id = ? AND project_id = ? AND (github_issue_repo = ? OR github_issue_repo IS NULL)",
        )
        .get(issueNumber, project.id, repoFullName);

      if (existingTask) {
        // Update existing task if title or body changed
        if (existingTask.text !== title || existingTask.notes !== body) {
          db.prepare(
            `
            UPDATE tasks SET
              text = ?,
              notes = ?,
              tags = ?,
              github_issue_repo = COALESCE(github_issue_repo, ?),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(
            title,
            body,
            JSON.stringify(labels),
            repoFullName,
            existingTask.id,
          );
          updated++;
        }
      } else {
        // Create new task in backlog
        const maxResult = db
          .prepare(
            "SELECT MAX(sort_order) as max_order, MAX(task_number) as max_task_num FROM tasks",
          )
          .get();
        const sortOrder = (maxResult?.max_order || 0) + 1;
        const taskNumber = (maxResult?.max_task_num || 0) + 1;

        db.prepare(
          `
          INSERT INTO tasks (text, status, tags, sort_order, notes, task_number, github_issue_id, github_issue_repo, project_id)
          VALUES (?, 'backlog', ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          title,
          JSON.stringify(labels),
          sortOrder,
          body,
          taskNumber,
          issueNumber,
          repoFullName,
          project.id,
        );
        created++;
      }
    }

    // Update project's last_sync_at
    db.prepare(
      "UPDATE projects SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(project.id);

    log(
      "info",
      `Synced ${owner}/${repo}: ${created} created, ${updated} updated`,
    );
    return { created, updated };
  } catch (error) {
    log("error", `Failed to sync ${owner}/${repo}`, { error: error.message });
    return { created: 0, updated: 0, error: error.message };
  }
}

/**
 * Run GitHub sync for all projects
 */
async function runGitHubSync() {
  // Check if we're globally rate limited before starting
  if (isGitHubRateLimited()) {
    const retryAfter = getRateLimitRetryAfter();
    log(
      "warn",
      `Skipping GitHub sync cycle: rate limited (retry in ${retryAfter}s)`,
    );
    return;
  }

  log("info", "Starting GitHub sync cycle");

  const db = getDb();

  try {
    // Get all projects with GitHub repo URL
    const projects = db
      .prepare(
        `
      SELECT id, name, github_repo_url, local_path
      FROM projects
      WHERE github_repo_url IS NOT NULL AND github_repo_url != ''
    `,
      )
      .all();

    if (projects.length === 0) {
      log("info", "No projects with GitHub repos to sync");
      return;
    }

    log("info", `Found ${projects.length} projects to sync`);

    let totalCreated = 0;
    let totalUpdated = 0;
    let errors = 0;
    let rateLimited = 0;

    for (const project of projects) {
      // Stop early if we hit rate limit during sync
      if (isGitHubRateLimited()) {
        const retryAfter = getRateLimitRetryAfter();
        log(
          "warn",
          `Stopping sync early: rate limited (retry in ${retryAfter}s). Remaining projects: ${projects.length - projects.indexOf(project)}`,
        );
        rateLimited = projects.length - projects.indexOf(project);
        break;
      }

      const result = await syncGitHubIssues(db, project);
      if (result.rateLimited) {
        rateLimited++;
        // Don't continue if we hit rate limit
        break;
      } else if (result.error) {
        errors++;
      } else if (!result.skipped) {
        totalCreated += result.created;
        totalUpdated += result.updated;
      }
    }

    const statusMsg =
      rateLimited > 0
        ? `GitHub sync paused (rate limited): ${totalCreated} created, ${totalUpdated} updated, ${errors} errors, ${rateLimited} skipped`
        : `GitHub sync complete: ${totalCreated} created, ${totalUpdated} updated, ${errors} errors`;
    log("info", statusMsg);
  } finally {
    db.close();
  }
}

/**
 * Execute git command in a specific directory
 */
function execGit(localPath, args) {
  const command = `git ${args.join(" ")}`;
  log("debug", `Executing: ${command} in ${localPath}`);

  try {
    const result = execSync(command, {
      cwd: localPath,
      encoding: "utf-8",
      timeout: 30000,
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

/**
 * Check if directory is a git repository
 */
function isGitRepo(localPath) {
  return fs.existsSync(path.join(localPath, ".git"));
}

/**
 * Get the remote URL for the repository
 */
function getGitRemoteUrl(localPath) {
  const result = execGit(localPath, ["remote", "get-url", "origin"]);
  return result.success ? result.output : null;
}

/**
 * Process completed tasks and perform git operations
 */
async function processCompletedTasks() {
  const db = getDb();

  try {
    // Find recently completed tasks with project_id that haven't been processed
    const completedTasks = db
      .prepare(
        `
      SELECT
        t.id,
        t.task_number,
        t.text,
        t.project_id,
        t.updated_at,
        p.name as project_name,
        p.local_path,
        p.github_repo_url
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.status = 'completed'
        AND p.local_path IS NOT NULL
        AND p.local_path != ''
      ORDER BY t.updated_at DESC
      LIMIT 50
    `,
      )
      .all();

    for (const task of completedTasks) {
      // Skip if already processed
      if (processedCompletedTasks.has(task.id)) continue;

      // Validate local_path exists
      if (!fs.existsSync(task.local_path)) {
        log(
          "warn",
          `Local path does not exist for task ${task.task_number}: ${task.local_path}`,
        );
        processedCompletedTasks.add(task.id);
        continue;
      }

      // Check if it's a git repository
      if (!isGitRepo(task.local_path)) {
        log("warn", `Not a git repository: ${task.local_path}`);
        processedCompletedTasks.add(task.id);
        continue;
      }

      log(
        "info",
        `Processing completed task #${task.task_number} for project "${task.project_name}"`,
      );
      log("info", `Working directory: ${task.local_path}`);

      // Check for uncommitted changes
      const statusResult = execGit(task.local_path, ["status", "--porcelain"]);
      if (!statusResult.success) {
        log("error", `Failed to get git status: ${statusResult.error}`);
        processedCompletedTasks.add(task.id);
        continue;
      }

      const hasChanges = statusResult.output.length > 0;

      if (hasChanges) {
        log("info", `Found uncommitted changes in ${task.local_path}`);

        // Stage all changes
        const addResult = execGit(task.local_path, ["add", "-A"]);
        if (!addResult.success) {
          log("error", `Failed to stage changes: ${addResult.error}`);
          processedCompletedTasks.add(task.id);
          continue;
        }

        // Create commit message referencing the task
        const commitMessage = `task(#${task.task_number}): ${task.text}

Completed via Dashboard Worker
Task ID: ${task.id}`;

        const commitResult = execGit(task.local_path, [
          "commit",
          "-m",
          commitMessage,
        ]);
        if (!commitResult.success) {
          // Check if it's just "nothing to commit"
          if (commitResult.stderr.includes("nothing to commit")) {
            log("info", "Nothing to commit after staging");
          } else {
            log("error", `Failed to commit: ${commitResult.error}`);
          }
          processedCompletedTasks.add(task.id);
          continue;
        }

        log("info", `Created commit for task #${task.task_number}`);

        // Push to remote if github_repo_url is configured
        if (task.github_repo_url) {
          // Verify the remote URL matches the project's github_repo_url
          const remoteUrl = getGitRemoteUrl(task.local_path);
          if (remoteUrl) {
            const pushResult = execGit(task.local_path, [
              "push",
              "origin",
              "HEAD",
            ]);
            if (pushResult.success) {
              log("info", `Pushed to remote for task #${task.task_number}`);
            } else {
              log("warn", `Failed to push: ${pushResult.error}`);
            }
          }
        }

        appendWorkNote(
          db,
          task.id,
          `Auto-commit created by worker: "${commitMessage.split("\n")[0]}"`,
          "system",
        );
      } else {
        log("debug", `No changes to commit for task #${task.task_number}`);
      }

      // Mark as processed
      processedCompletedTasks.add(task.id);
    }

    // Clean up old processed task IDs (keep last 1000)
    if (processedCompletedTasks.size > 1000) {
      const arr = Array.from(processedCompletedTasks);
      const toRemove = arr.slice(0, arr.length - 1000);
      toRemove.forEach((id) => processedCompletedTasks.delete(id));
    }
  } finally {
    db.close();
  }
}

/**
 * Main worker loop
 */
async function main() {
  log("info", "=".repeat(60));
  log("info", "Dashboard Recurring Work Worker Started");
  log("info", `Database: ${DB_PATH}`);
  log("info", `Sync Interval: ${SYNC_INTERVAL_MS / 1000 / 60} minutes`);
  log("info", `Task Check Interval: ${TASK_CHECK_INTERVAL_MS / 1000} seconds`);
  log("info", "=".repeat(60));

  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    log("error", `Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  // Run initial sync
  await runGitHubSync();

  // Set up recurring GitHub sync
  setInterval(async () => {
    await runGitHubSync();
  }, SYNC_INTERVAL_MS);

  // Set up task processing loop
  setInterval(async () => {
    await processCompletedTasks();
  }, TASK_CHECK_INTERVAL_MS);

  // Keep the process running
  log("info", "Worker is running. Press Ctrl+C to stop.");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  log("info", "Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("info", "Received SIGTERM, shutting down...");
  process.exit(0);
});

// Run the worker
main().catch((error) => {
  log("error", "Worker failed", { error: error.message, stack: error.stack });
  process.exit(1);
});
