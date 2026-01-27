import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import { DbTask } from "@/types/task";
import { getDefaultTaskStatus } from "@/lib/task-statuses";
import {
  withErrorHandling,
  badRequest,
  notFound,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

type SelectedIssue = { repo: string; number: number };

type GitHubIssue = {
  number: number;
  title: string;
  body?: string;
  state: string;
  labels?: { name: string }[];
  pull_request?: unknown;
};

function parseRepoFullName(repo: string): string | null {
  if (repo.includes("github.com/")) {
    const match = repo.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) return `${match[1]}/${match[2].replace(/\.git$/, "")}`;
  }
  if (repo.includes("/")) return repo.trim();
  return null;
}

function normalizeSelections(
  selections: unknown[],
  defaultRepoFullName: string,
): SelectedIssue[] {
  const results: SelectedIssue[] = [];

  for (const item of selections) {
    if (typeof item === "number") {
      results.push({ repo: defaultRepoFullName, number: item });
      continue;
    }
    if (typeof item === "string") {
      const match = item.match(/^(.+?)#(\d+)$/);
      if (match) {
        const repoFullName = parseRepoFullName(match[1]) || defaultRepoFullName;
        results.push({ repo: repoFullName, number: parseInt(match[2], 10) });
      }
      continue;
    }
    if (typeof item === "object" && item !== null) {
      const value = item as { repo?: string; number?: number };
      if (typeof value.number === "number") {
        const repoFullName = value.repo
          ? parseRepoFullName(value.repo) || defaultRepoFullName
          : defaultRepoFullName;
        results.push({ repo: repoFullName, number: value.number });
      }
    }
  }

  return results;
}

async function fetchIssueByNumber(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string,
): Promise<GitHubIssue> {
  const issueResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!issueResponse.ok) {
    const errorData = await issueResponse.json();
    throw badRequest(
      `GitHub API error: ${errorData.message || "Unknown error"}`,
      "GITHUB_API_ERROR",
    );
  }

  return issueResponse.json() as Promise<GitHubIssue>;
}

// GET /api/projects/[id]/sync - Trigger GitHub sync for a project
export const GET = withErrorHandling(
  async (
    _req: NextRequest,
    context?: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    try {
      const routeParams = await context?.params;
      const projectId = parseInt(routeParams?.id ?? "", 10);

      if (isNaN(projectId)) {
        throw badRequest("Invalid project ID", "INVALID_PROJECT_ID");
      }

      const db = getDb();

      // Check project exists
      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId) as
        | { id: number; name: string; github_repo_url: string | null }
        | undefined;
      if (!project) {
        releaseDb(db);
        throw notFound(
          `Project with id ${projectId} not found`,
          "PROJECT_NOT_FOUND",
        );
      }

      if (!project.github_repo_url) {
        releaseDb(db);
        throw badRequest(
          "Project does not have a GitHub repository configured",
          "NO_GITHUB_REPO",
        );
      }

      const syncEnabled =
        process.env.GITHUB_ISSUE_SYNC_ENABLED?.toLowerCase() === "true";

      if (!syncEnabled) {
        releaseDb(db);
        return NextResponse.json({
          success: false,
          disabled: true,
          message:
            "Automatic GitHub issue re-sync is disabled. Set GITHUB_ISSUE_SYNC_ENABLED=true to enable.",
          project: { id: project.id, name: project.name },
        });
      }

      // Parse GitHub repo URL to get owner and repo
      const repoUrl = project.github_repo_url;
      let owner = "";
      let repo = "";

      // Handle various URL formats
      if (repoUrl.includes("github.com/")) {
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (match) {
          owner = match[1];
          repo = match[2].replace(/\.git$/, "");
        }
      } else if (repoUrl.includes(":")) {
        const [o, r] = repoUrl.split(":");
        owner = o;
        repo = r;
      }

      if (!owner || !repo) {
        releaseDb(db);
        throw badRequest(
          "Could not parse GitHub repository URL",
          "INVALID_GITHUB_URL",
        );
      }

      // Get GITHUB_TOKEN from environment
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken || githubToken.trim() === "") {
        releaseDb(db);
        throw badRequest(
          "GITHUB_TOKEN environment variable is not set. Add it to enable GitHub sync.",
          "NO_GITHUB_TOKEN",
        );
      }

      // Fetch issues from GitHub
      const issuesResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );

      if (!issuesResponse.ok) {
        const errorText = await issuesResponse.text();
        const errorData = JSON.parse(errorText);

        // Provide helpful error messages for common issues
        if (issuesResponse.status === 401) {
          releaseDb(db);
          throw badRequest(
            "GitHub authentication failed. Check that GITHUB_TOKEN environment variable is set and valid.",
            "GITHUB_AUTH_ERROR",
          );
        }
        if (issuesResponse.status === 404) {
          releaseDb(db);
          throw badRequest(
            `Repository not found: ${owner}/${repo}. Check the GitHub repository URL.`,
            "GITHUB_REPO_NOT_FOUND",
          );
        }

        releaseDb(db);
        throw badRequest(
          `GitHub API error (${issuesResponse.status}): ${errorData.message || errorText}`,
          "GITHUB_API_ERROR",
        );
      }

      const githubIssues = await issuesResponse.json();

      if (!Array.isArray(githubIssues)) {
        releaseDb(db);
        throw badRequest(
          "Invalid response from GitHub API",
          "GITHUB_API_ERROR",
        );
      }

      // Process issues and sync to tasks
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const issue of githubIssues) {
        if (issue.pull_request) {
          // Skip PRs
          continue;
        }

        const issueNumber = issue.number;
        const title = issue.title;
        const body = issue.body || "";
        const labels =
          issue.labels?.map((l: { name: string }) => l.name).filter(Boolean) ||
          [];

        // Check if task with this github_issue_id exists
        const existingTask = db
          .prepare("SELECT * FROM tasks WHERE github_issue_id = ?")
          .get(issueNumber) as DbTask | undefined;

        if (existingTask) {
          // Update existing task
          db.prepare(
            `
            UPDATE tasks SET
              text = ?,
              notes = ?,
              tags = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(title, body, JSON.stringify(labels), existingTask.id);
          updated++;
        } else {
          // Create new task
          const maxResult = db
            .prepare(
              "SELECT MAX(sort_order) as max_order, MAX(task_number) as max_task_num FROM tasks",
            )
            .get() as { max_order: number | null; max_task_num: number | null };
          const sortOrder = (maxResult?.max_order || 0) + 1;
          const taskNumber = (maxResult?.max_task_num || 0) + 1;

          // Determine initial status based on issue state
          let status = getDefaultTaskStatus();

          db.prepare(
            `
            INSERT INTO tasks (text, status, tags, sort_order, notes, task_number, github_issue_id, project_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            title,
            status,
            JSON.stringify(labels),
            sortOrder,
            body,
            taskNumber,
            issueNumber,
            projectId,
          );
          created++;
        }
      }

      // Update project's last_sync_at timestamp
      db.prepare(
        "UPDATE projects SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(projectId);

      releaseDb(db);

      return NextResponse.json({
        success: true,
        project: { id: project.id, name: project.name },
        sync: {
          created,
          updated,
          errors: errors.length > 0 ? errors : undefined,
          repository: `${owner}/${repo}`,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, {
        route: "/api/projects/[id]/sync",
        method: "GET",
      });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects/[id]/sync", method: "GET" } },
);

// POST /api/projects/[id]/sync - Sync selected GitHub issues for a project
export const POST = withErrorHandling(
  async (
    req: NextRequest,
    context?: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    try {
      const routeParams = await context?.params;
      const projectId = parseInt(routeParams?.id ?? "", 10);

      if (isNaN(projectId)) {
        throw badRequest("Invalid project ID", "INVALID_PROJECT_ID");
      }

      const body = await req.json();
      const selectedIssuesRaw: unknown[] = body.issues || [];

      if (!Array.isArray(selectedIssuesRaw) || selectedIssuesRaw.length === 0) {
        throw badRequest("No issues selected for sync", "NO_ISSUES_SELECTED");
      }

      const db = getDb();

      // Check project exists
      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId) as
        | {
            id: number;
            name: string;
            github_repo_url: string | null;
            github_sync_settings: string | null;
          }
        | undefined;

      if (!project) {
        releaseDb(db);
        throw notFound(
          `Project with id ${projectId} not found`,
          "PROJECT_NOT_FOUND",
        );
      }

      if (!project.github_repo_url) {
        releaseDb(db);
        throw badRequest(
          "Project does not have a GitHub repository configured",
          "NO_GITHUB_REPO",
        );
      }

      // Parse GitHub repo URL
      const repoUrl = project.github_repo_url;
      let owner = "";
      let repo = "";

      if (repoUrl.includes("github.com/")) {
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (match) {
          owner = match[1];
          repo = match[2].replace(/\.git$/, "");
        }
      }

      if (!owner || !repo) {
        releaseDb(db);
        throw badRequest(
          "Could not parse GitHub repository URL",
          "INVALID_GITHUB_URL",
        );
      }

      // Get GITHUB_TOKEN from environment
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken || githubToken.trim() === "") {
        releaseDb(db);
        throw badRequest(
          "GITHUB_TOKEN environment variable is not set.",
          "NO_GITHUB_TOKEN",
        );
      }

      const defaultRepoFullName = `${owner}/${repo}`;
      const selectedIssues = normalizeSelections(
        selectedIssuesRaw,
        defaultRepoFullName,
      );

      console.log("[import] selected issues", {
        projectId,
        totalSelected: selectedIssuesRaw.length,
        normalizedSelected: selectedIssues.length,
        repos: Array.from(new Set(selectedIssues.map((i) => i.repo))),
      });

      if (selectedIssues.length === 0) {
        releaseDb(db);
        throw badRequest(
          "No valid issues selected for sync",
          "NO_ISSUES_SELECTED",
        );
      }

      // Fetch only the selected issues from GitHub
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      const issuesByRepo = new Map<string, Set<number>>();
      for (const issue of selectedIssues) {
        const set = issuesByRepo.get(issue.repo) || new Set<number>();
        set.add(issue.number);
        issuesByRepo.set(issue.repo, set);
      }

      for (const [repoFullName, issueNumbers] of issuesByRepo.entries()) {
        const [repoOwner, repoName] = repoFullName.split("/");
        if (!repoOwner || !repoName) {
          errors.push(`Invalid repo format: ${repoFullName}`);
          continue;
        }

        try {
          console.log("[import] fetching issues", {
            repoFullName,
            count: issueNumbers.size,
            issues: Array.from(issueNumbers.values()),
          });
          for (const issueNumber of issueNumbers.values()) {
            const issue = await fetchIssueByNumber(
              repoOwner,
              repoName,
              issueNumber,
              githubToken,
            );
            if (issue.pull_request) continue;

            const result = await syncIssueToTask(
              db,
              issue,
              projectId,
              repoFullName,
            );
            if (result === "created") created++;
            if (result === "updated") updated++;
            console.log("[import] issue processed", {
              repoFullName,
              number: issue.number,
              result,
            });
          }
        } catch (err) {
          console.error("[import] repo import error", {
            repoFullName,
            message: (err as Error).message,
          });
          errors.push(`${repoFullName}: ${(err as Error).message}`);
        }
      }

      console.log("[import] completed", {
        projectId,
        created,
        updated,
        errors: errors.length,
      });

      // Update project's last_sync_at timestamp
      db.prepare(
        "UPDATE projects SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(projectId);

      releaseDb(db);

      return NextResponse.json({
        success: true,
        project: { id: project.id, name: project.name },
        sync: {
          created,
          updated,
          errors: errors.length > 0 ? errors : undefined,
          repository: `${owner}/${repo}`,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, {
        route: "/api/projects/[id]/sync",
        method: "POST",
      });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects/[id]/sync", method: "POST" } },
);

// Helper function to sync a single issue to a task
async function syncIssueToTask(
  db: ReturnType<typeof getDb>,
  issue: {
    number: number;
    title: string;
    body?: string;
    state: string;
    labels?: { name: string }[];
    html_url?: string;
    assignee?: { login?: string } | null;
    comments?: number;
    reactions?: { total_count?: number };
    created_at?: string;
    updated_at?: string;
  },
  projectId: number,
  repoFullName: string,
): Promise<"created" | "updated"> {
  const issueNumber = issue.number;
  const title = issue.title;
  const body = issue.body || "";
  const labels = issue.labels?.map((l) => l.name).filter(Boolean) || [];
  const priority = "medium";
  const details = body.trim();

  const columns = db.prepare("PRAGMA table_info(tasks)").all() as {
    name: string;
  }[];
  const hasIssueRepoColumn = columns.some(
    (col) => col.name === "github_issue_repo",
  );

  // Check if task with this github_issue_id exists
  const existingTask = hasIssueRepoColumn
    ? (db
        .prepare(
          "SELECT * FROM tasks WHERE github_issue_id = ? AND project_id = ? AND (github_issue_repo = ? OR github_issue_repo IS NULL)",
        )
        .get(issueNumber, projectId, repoFullName) as DbTask | undefined)
    : (db
        .prepare(
          "SELECT * FROM tasks WHERE github_issue_id = ? AND project_id = ?",
        )
        .get(issueNumber, projectId) as DbTask | undefined);

  if (existingTask) {
    // Update existing task
    if (hasIssueRepoColumn) {
      db.prepare(
        `
        UPDATE tasks SET
          text = ?,
          notes = CASE
            WHEN notes IS NULL OR TRIM(notes) = '' THEN ?
            ELSE notes
          END,
          tags = ?,
          priority = CASE
            WHEN priority IS NULL OR TRIM(priority) = '' THEN ?
            ELSE priority
          END,
          github_issue_repo = COALESCE(github_issue_repo, ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(
        title,
        details,
        JSON.stringify(labels),
        priority,
        repoFullName,
        existingTask.id,
      );
    } else {
      db.prepare(
        `
        UPDATE tasks SET
          text = ?,
          notes = CASE
            WHEN notes IS NULL OR TRIM(notes) = '' THEN ?
            ELSE notes
          END,
          tags = ?,
            priority = CASE
              WHEN priority IS NULL OR TRIM(priority) = '' THEN ?
              ELSE priority
            END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(title, details, JSON.stringify(labels), priority, existingTask.id);
    }
    return "updated";
  } else {
    // Create new task
    const maxResult = db
      .prepare(
        "SELECT MAX(sort_order) as max_order, MAX(task_number) as max_task_num FROM tasks",
      )
      .get() as {
      max_order: number | null;
      max_task_num: number | null;
    };
    const sortOrder = (maxResult?.max_order || 0) + 1;
    const taskNumber = (maxResult?.max_task_num || 0) + 1;

    const status = getDefaultTaskStatus();

    if (hasIssueRepoColumn) {
      db.prepare(
        `
        INSERT INTO tasks (text, status, tags, priority, sort_order, notes, task_number, github_issue_id, github_issue_repo, project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        title,
        status,
        JSON.stringify(labels),
        priority,
        sortOrder,
        details,
        taskNumber,
        issueNumber,
        repoFullName,
        projectId,
      );
    } else {
      db.prepare(
        `
        INSERT INTO tasks (text, status, tags, priority, sort_order, notes, task_number, github_issue_id, project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        title,
        status,
        JSON.stringify(labels),
        priority,
        sortOrder,
        details,
        taskNumber,
        issueNumber,
        projectId,
      );
    }
    return "created";
  }
}
