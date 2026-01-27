import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  badRequest,
  notFound,
  databaseError,
  logError,
} from "@/lib/api-error-handler";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { getWorkspacePath } from "@/lib/workspace-path";
import { fetchRepoMetadata as fetchRepoMetadataWithRateLimit } from "@/lib/github";

const execFileAsync = promisify(execFile);

type ProjectWithTaskCount = {
  id: number;
  name: string;
  description: string | null;
  github_repo_url: string | null;
  local_only: number;
  auto_provision_workspace: number;
  local_path: string | null;
  tech_stack: string | null;
  github_sync_settings: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  task_count: number;
};

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  let match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  match = url.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

async function validateRepoAccess(owner: string, repo: string) {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "repo",
      "view",
      `${owner}/${repo}`,
      "--json",
      "name,description,url,defaultBranchRef,viewerPermission",
    ],
    { timeout: 30000 },
  );

  const repoData = JSON.parse(stdout);
  return {
    name: repoData.name as string,
    url: repoData.url as string,
    defaultBranch: (repoData.defaultBranchRef?.name as string) || "main",
    permission: (repoData.viewerPermission as string) || "UNKNOWN",
  };
}

async function ensureGitRepo(localPath: string) {
  const gitDir = path.join(localPath, ".git");
  if (!fs.existsSync(gitDir)) {
    await execFileAsync("git", ["init"], { cwd: localPath, timeout: 30000 });
  }
}

async function setRemote(localPath: string, remoteUrl: string) {
  try {
    await execFileAsync("git", ["remote", "get-url", "origin"], {
      cwd: localPath,
      timeout: 10000,
    });
    await execFileAsync("git", ["remote", "set-url", "origin", remoteUrl], {
      cwd: localPath,
      timeout: 10000,
    });
  } catch {
    await execFileAsync("git", ["remote", "add", "origin", remoteUrl], {
      cwd: localPath,
      timeout: 10000,
    });
  }
}

async function cloneRepo(owner: string, repo: string, localPath: string) {
  await execFileAsync("gh", ["repo", "clone", `${owner}/${repo}`, localPath], {
    timeout: 120000,
  });
}

// Use shared GitHub utility with rate limiting
async function fetchRepoMetadataSafe(
  owner: string,
  repo: string,
  token: string,
) {
  const result = await fetchRepoMetadataWithRateLimit(owner, repo, token);
  return result.data; // Returns null on error/rate limit, which is graceful
}

// GET /api/projects/[id] - Get a single project
export const GET = withErrorHandling(
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

      const db = getDb();

      const project = db
        .prepare(
          `
        SELECT
          p.id,
          p.name,
          p.description,
          p.github_repo_url,
          p.local_only,
          p.auto_provision_workspace,
          p.local_path,
          p.tech_stack,
          p.github_sync_settings,
          p.last_sync_at,
          p.created_at,
          p.updated_at,
          COUNT(t.id) as task_count
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.id = ?
        GROUP BY p.id
      `,
        )
        .get(projectId) as ProjectWithTaskCount | undefined;

      if (!project) {
        releaseDb(db);
        throw notFound(
          `Project with id ${projectId} not found`,
          "PROJECT_NOT_FOUND",
        );
      }

      releaseDb(db);

      const githubUrl = project.github_repo_url as string | null;
      const githubToken = process.env.GITHUB_TOKEN?.trim();
      let githubRepoFullName: string | null = null;
      let githubParentRepo: string | null = null;

      if (githubUrl) {
        const parsed = parseGitHubUrl(githubUrl);
        if (parsed) {
          githubRepoFullName = `${parsed.owner}/${parsed.repo}`;
          if (githubToken) {
            const repoInfo = await fetchRepoMetadataSafe(
              parsed.owner,
              parsed.repo,
              githubToken,
            );
            if (repoInfo?.full_name) {
              githubRepoFullName = repoInfo.full_name;
            }
            if (repoInfo?.fork && repoInfo.parent?.full_name) {
              githubParentRepo = repoInfo.parent.full_name;
            }
          }
        }
      }

      return NextResponse.json({
        project: {
          ...project,
          github_repo_full_name: githubRepoFullName,
          github_parent_repo: githubParentRepo,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/projects/[id]", method: "GET" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects/[id]", method: "GET" } },
);

// PUT /api/projects/[id] - Update a project
export const PUT = withErrorHandling(
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
      const {
        name,
        description,
        github_repo_url,
        local_only,
        auto_provision_workspace,
        github_sync_settings,
        link_only,
      } = body;

      const db = getDb();

      // Check project exists
      const existing = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId);
      if (!existing) {
        releaseDb(db);
        throw notFound(
          `Project with id ${projectId} not found`,
          "PROJECT_NOT_FOUND",
        );
      }

      // Build dynamic update
      const updates: string[] = [];
      const sqlParams: (string | number | null)[] = [];

      if (name !== undefined) {
        updates.push("name = ?");
        sqlParams.push(name.trim());
      }
      if (description !== undefined) {
        updates.push("description = ?");
        sqlParams.push(description.trim() || null);
      }
      if (github_repo_url !== undefined) {
        updates.push("github_repo_url = ?");
        sqlParams.push(github_repo_url.trim() || null);
      }
      if (local_only !== undefined) {
        updates.push("local_only = ?");
        sqlParams.push(local_only ? 1 : 0);
      }
      if (auto_provision_workspace !== undefined) {
        updates.push("auto_provision_workspace = ?");
        sqlParams.push(auto_provision_workspace ? 1 : 0);
      }
      if (github_sync_settings !== undefined) {
        updates.push("github_sync_settings = ?");
        sqlParams.push(github_sync_settings);
      }

      if (updates.length > 0) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        sqlParams.push(projectId);
        db.prepare(
          `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`,
        ).run(...sqlParams);
      }

      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId) as
        | {
            id: number;
            name: string;
            local_path: string | null;
            auto_provision_workspace: number;
            local_only: number;
            github_repo_url: string | null;
          }
        | undefined;
      releaseDb(db);

      if (!project) {
        throw notFound(
          `Project with id ${projectId} not found`,
          "PROJECT_NOT_FOUND",
        );
      }

      const githubUrlTrimmed = project.github_repo_url?.trim() || null;
      const isLocalOnly = project.local_only === 1;

      if (githubUrlTrimmed && !isLocalOnly) {
        const parsed = parseGitHubUrl(githubUrlTrimmed);
        if (!parsed) {
          throw badRequest("Invalid GitHub URL format", "INVALID_GITHUB_URL");
        }

        try {
          await validateRepoAccess(parsed.owner, parsed.repo);
        } catch (error) {
          const err = error as Error & { stderr?: string };
          if (err.stderr?.includes("Could not resolve")) {
            throw badRequest(
              "Repository not found or not accessible",
              "REPO_NOT_FOUND",
            );
          }
          if (err.stderr?.includes("gh auth login")) {
            throw badRequest(
              "GitHub CLI not authenticated. Run `gh auth login` first.",
              "GH_NOT_AUTHENTICATED",
            );
          }
          throw badRequest(
            "Failed to validate repository",
            "REPO_VALIDATE_FAILED",
          );
        }

        let localPath = project.local_path;
        const shouldProvision = project.auto_provision_workspace === 1;
        if (!localPath && shouldProvision) {
          const sanitizedName = project.name
            .replace(/[^a-zA-Z0-9-_]/g, "_")
            .toLowerCase();
          const workspaceRoot =
            process.env.WORKSPACE_ROOT ||
            path.join(getWorkspacePath(), "projects");
          localPath = path.join(workspaceRoot, sanitizedName);
          fs.mkdirSync(localPath, { recursive: true });
          const db2 = getDb();
          db2
            .prepare(
              "UPDATE projects SET local_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .run(localPath, projectId);
          releaseDb(db2);
        }

        if (localPath) {
          const hasContents =
            fs.existsSync(localPath) && fs.readdirSync(localPath).length > 0;
          if (!hasContents && link_only !== true) {
            await cloneRepo(parsed.owner, parsed.repo, localPath);
          } else {
            await ensureGitRepo(localPath);
            await setRemote(localPath, githubUrlTrimmed);
          }
        }
      }

      return NextResponse.json({ project });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/projects/[id]", method: "PUT" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects/[id]", method: "PUT" } },
);

// DELETE /api/projects/[id] - Delete a project with cascade options
// Query params:
//   cascade=metadata (default) - Delete project only, orphan tasks
//   cascade=tasks - Delete project and all associated tasks
//   cascade=all - Delete project, tasks, and local files
export const DELETE = withErrorHandling(
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

      // Get cascade option from query params
      const { searchParams } = new URL(req.url);
      const cascade = searchParams.get("cascade") || "metadata";

      if (!["metadata", "tasks", "all"].includes(cascade)) {
        throw badRequest(
          "Invalid cascade option. Must be: metadata, tasks, or all",
          "INVALID_CASCADE_OPTION",
        );
      }

      const db = getDb();

      // Check project exists
      const existing = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId);
      if (!existing) {
        releaseDb(db);
        throw notFound(
          `Project with id ${projectId} not found`,
          "PROJECT_NOT_FOUND",
        );
      }

      const project = existing as {
        id: number;
        name: string;
        local_path: string | null;
      };

      // Use transaction for atomic cascade deletion
      const transaction = db.transaction(() => {
        // Get count of associated tasks
        const taskCount = db
          .prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ?")
          .get(projectId) as { count: number };

        let tasksDeleted = 0;
        let tasksOrphaned = 0;

        if (cascade === "metadata") {
          // Just orphan the tasks (set project_id to NULL)
          db.prepare(
            "UPDATE tasks SET project_id = NULL WHERE project_id = ?",
          ).run(projectId);
          tasksOrphaned = taskCount.count;
        } else {
          // Delete tasks (for 'tasks' or 'all' cascade)
          db.prepare("DELETE FROM tasks WHERE project_id = ?").run(projectId);
          tasksDeleted = taskCount.count;
        }

        // Delete the project
        db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

        return { taskCount: taskCount.count, tasksDeleted, tasksOrphaned };
      });

      const result = transaction();
      releaseDb(db);

      // Handle local files deletion if cascade=all
      let filesDeleted = false;
      let filesError: string | null = null;

      if (cascade === "all") {
        const localPath = project.local_path;
        if (localPath && localPath.trim() !== "") {
          try {
            // Safety check: ensure path is within expected workspace directory
            const workspaceRoot = getWorkspacePath();
            const safePathPrefixes = [
              path.join(workspaceRoot, "projects"),
              workspaceRoot,
            ];

            const isPathSafe = safePathPrefixes.some(
              (prefix) =>
                localPath.startsWith(prefix) &&
                localPath.length > prefix.length,
            );

            if (isPathSafe && fs.existsSync(localPath)) {
              fs.rmSync(localPath, { recursive: true, force: true });
              filesDeleted = true;
            } else if (!isPathSafe) {
              filesError = "Path is outside allowed workspace directory";
            }
          } catch (err) {
            filesError =
              err instanceof Error
                ? err.message
                : "Unknown error deleting files";
          }
        }
      }

      return NextResponse.json({
        success: true,
        deleted: {
          projectId,
          projectName: project.name,
          cascade,
          tasksDeleted: result.tasksDeleted,
          tasksOrphaned: result.tasksOrphaned,
          filesDeleted,
          filesError,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, {
        route: "/api/projects/[id]",
        method: "DELETE",
      });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects/[id]", method: "DELETE" } },
);
