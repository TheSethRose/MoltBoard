#!/usr/bin/env node

/**
 * Project Sync Cron Job
 * Syncs GitHub issues for projects with github_repo_url configured
 *
 * Usage: node project-sync-cron.js
 */

import path from "node:path";
import { execSync } from "node:child_process";
import { getWorkspacePath } from "../../../scripts/workspace-path.js";

const DB_PATH =
  process.env.TASKS_DB_PATH ||
  path.join(getWorkspacePath(), "data", "tasks.db");
const DEFAULT_APP_URL = "http://localhost:5278";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  DEFAULT_APP_URL;

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function queryDb(sql) {
  try {
    const result = execSync(
      `sqlite3 "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`,
      { encoding: "utf8" },
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

function syncProject(projectId) {
  try {
    const result = execSync(
      `curl -s -X GET "${APP_URL}/api/projects/${projectId}/sync"`,
      { encoding: "utf8", timeout: 30000 },
    );
    const data = JSON.parse(result);
    if (data.disabled) {
      log(`  ⊘ Project ${projectId}: ${data.message}`);
      return true;
    }
    if (data.success) {
      log(
        `  ✓ Project ${projectId}: ${data.sync.created} created, ${data.sync.updated} updated`,
      );
      return true;
    }
    log(`  ✗ Project ${projectId}: ${data.error || "Unknown error"}`);
    return false;
  } catch (e) {
    log(`  ✗ Project ${projectId}: ${e.message}`);
    return false;
  }
}

function main() {
  log("Starting project sync cron job");

  // Get all projects with github_repo_url configured
  const result = queryDb(`
    SELECT id, name, github_repo_url
    FROM projects
    WHERE github_repo_url IS NOT NULL AND github_repo_url != ''
    ORDER BY updated_at ASC
  `);

  if (!result) {
    log("No projects found with GitHub repos");
    process.exit(0);
  }

  const lines = result.split("\n");
  const projects = lines.map((line) => {
    const [id, name, github_repo_url] = line.split("|");
    return { id: parseInt(id), name, github_repo_url };
  });

  log(`Found ${projects.length} project(s) with GitHub repos`);

  let synced = 0;
  let failed = 0;

  for (const project of projects) {
    log(`Syncing project: ${project.name} (${project.github_repo_url})`);
    const success = syncProject(project.id);
    if (success) {
      synced++;
    } else {
      failed++;
    }
  }

  log(`Summary: ${synced} synced, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
