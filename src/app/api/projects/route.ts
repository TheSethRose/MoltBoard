import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { getWorkspacePath } from "@/lib/workspace-path";
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  badRequest,
  databaseError,
  logError,
} from "@/lib/api-error-handler";
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

// Use shared GitHub utility with rate limiting
async function fetchRepoMetadataSafe(owner: string, repo: string, token: string) {
  const result = await fetchRepoMetadataWithRateLimit(owner, repo, token);
  return result.data; // Returns null on error/rate limit, which is graceful
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

// GET /api/projects - List all projects
export const GET = withErrorHandling(
  async (): Promise<NextResponse> => {
    try {
      const db = getDb();

      const projects = db
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
          p.last_sync_at,
          p.created_at,
          p.updated_at,
          COUNT(t.id) as task_count
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `,
        )
        .all() as ProjectWithTaskCount[];

      const tasks = db
        .prepare(
          `
        SELECT project_id, status, tags
        FROM tasks
        WHERE project_id IS NOT NULL
      `,
        )
        .all() as { project_id: number; status: string; tags: string }[];

      releaseDb(db);

      const stats = new Map<
        number,
        { open: number; closed: number; tags: Set<string> }
      >();
      tasks.forEach((task) => {
        const entry = stats.get(task.project_id) || {
          open: 0,
          closed: 0,
          tags: new Set<string>(),
        };
        if (task.status === "completed") {
          entry.closed += 1;
        } else {
          entry.open += 1;
        }
        try {
          const parsed = JSON.parse(task.tags || "[]") as string[];
          parsed.forEach((tag) => entry.tags.add(tag));
        } catch {
          // ignore invalid tags
        }
        stats.set(task.project_id, entry);
      });

      const githubToken = process.env.GITHUB_TOKEN?.trim();
      const enriched = await Promise.all(
        projects.map(async (project) => {
          const projectId = project.id;
          const projectStats = stats.get(projectId);
          const githubUrl = project.github_repo_url || null;
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

          return {
            ...project,
            open_task_count: projectStats?.open || 0,
            closed_task_count: projectStats?.closed || 0,
            tags: projectStats ? Array.from(projectStats.tags) : [],
            github_repo_full_name: githubRepoFullName,
            github_parent_repo: githubParentRepo,
          };
        }),
      );

      return NextResponse.json({ projects: enriched });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/projects", method: "GET" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects", method: "GET" } },
);

// POST /api/projects - Create a new project
export const POST = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = await req.json();
      const {
        name,
        description,
        github_repo_url,
        local_only,
        auto_provision_workspace,
        link_only,
      } = body;

      if (!name || typeof name !== "string") {
        throw badRequest("Project name is required", "INVALID_PROJECT_NAME");
      }

      const db = getDb();

      const result = db
        .prepare(
          `
        INSERT INTO projects (name, description, github_repo_url, local_only, auto_provision_workspace)
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(
          name.trim(),
          description?.trim() || null,
          github_repo_url?.trim() || null,
          local_only === true ? 1 : 0,
          auto_provision_workspace === true ? 1 : 0,
        );

      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(result.lastInsertRowid) as
        | {
            id: number;
            auto_provision_workspace: number;
            local_path: string | null;
          }
        | undefined;

      if (!project) {
        releaseDb(db);
        throw new Error("Failed to retrieve created project");
      }

      const githubUrlTrimmed = github_repo_url?.trim() || null;
      const isLocalOnly = local_only === true;

      // Auto-provision workspace if enabled
      let workspacePath: string | null = null;
      if (project.auto_provision_workspace) {
        const sanitizedName = name
          .replace(/[^a-zA-Z0-9-_]/g, "_")
          .toLowerCase();
        const workspaceRoot =
          process.env.WORKSPACE_ROOT ||
          path.join(getWorkspacePath(), "projects");
        workspacePath = path.join(workspaceRoot, sanitizedName);

        try {
          fs.mkdirSync(workspacePath, { recursive: true });
          // Update local_path with the provisioned workspace path
          db.prepare(
            "UPDATE projects SET local_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(workspacePath, project.id);
        } catch (err) {
          console.error(
            `Failed to provision workspace for project ${project.id}:`,
            err,
          );
        }
      }

      if (workspacePath && !githubUrlTrimmed) {
        await ensureGitRepo(workspacePath);
      }

      // If GitHub URL provided and not local-only, validate and set up repo
      if (githubUrlTrimmed && !isLocalOnly) {
        const parsed = parseGitHubUrl(githubUrlTrimmed);
        if (!parsed) {
          releaseDb(db);
          throw badRequest("Invalid GitHub URL format", "INVALID_GITHUB_URL");
        }

        try {
          await validateRepoAccess(parsed.owner, parsed.repo);
        } catch (error) {
          const err = error as Error & { stderr?: string };
          if (err.stderr?.includes("Could not resolve")) {
            releaseDb(db);
            throw badRequest(
              "Repository not found or not accessible",
              "REPO_NOT_FOUND",
            );
          }
          if (err.stderr?.includes("gh auth login")) {
            releaseDb(db);
            throw badRequest(
              "GitHub CLI not authenticated. Run `gh auth login` first.",
              "GH_NOT_AUTHENTICATED",
            );
          }
          releaseDb(db);
          throw badRequest(
            "Failed to validate repository",
            "REPO_VALIDATE_FAILED",
          );
        }

        if (workspacePath) {
          const hasContents =
            fs.existsSync(workspacePath) &&
            fs.readdirSync(workspacePath).length > 0;
          if (!hasContents && link_only !== true) {
            await cloneRepo(parsed.owner, parsed.repo, workspacePath);
          } else {
            await ensureGitRepo(workspacePath);
            await setRemote(workspacePath, githubUrlTrimmed);
          }
        }
      }

      const descriptionTrimmed = description?.trim() || null;

      releaseDb(db);

      return NextResponse.json(
        {
          project: {
            id: project.id,
            name: name.trim(),
            description: descriptionTrimmed,
            github_repo_url: githubUrlTrimmed,
            local_only: local_only === true ? 1 : 0,
            auto_provision_workspace: auto_provision_workspace === true ? 1 : 0,
            local_path: workspacePath,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            task_count: 0,
          },
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/projects", method: "POST" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects", method: "POST" } },
);
