import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getWorkspacePath } from "@/lib/workspace-path";
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  badRequest,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

const execAsync = promisify(exec);

interface GitHubRepoInfo {
  name: string;
  description: string | null;
  clone_url: string;
  html_url: string;
  default_branch: string;
}

// Extract owner/repo from various GitHub URL formats
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Handle various formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  // owner/repo

  let match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }

  // Simple owner/repo format
  match = url.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }

  return null;
}

// GET /api/projects/import-github?url=... - Fetch repo info without importing
export const GET = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    const url = req.nextUrl.searchParams.get("url");

    console.info("[import-github][GET] request", {
      url,
      userAgent: req.headers.get("user-agent"),
    });

    if (!url) {
      console.warn("[import-github][GET] missing url param");
      throw badRequest("GitHub URL is required", "MISSING_URL");
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      console.warn("[import-github][GET] invalid url format", { url });
      throw badRequest("Invalid GitHub URL format", "INVALID_URL");
    }

    try {
      const cmd = `gh repo view ${parsed.owner}/${parsed.repo} --json name,description,url,defaultBranchRef`;
      console.info("[import-github][GET] fetching repo info", {
        owner: parsed.owner,
        repo: parsed.repo,
        cmd,
      });
      // Use gh CLI to fetch repo info (handles auth automatically)
      const { stdout } = await execAsync(cmd, { timeout: 30000 });

      const repoData = JSON.parse(stdout);

      return NextResponse.json({
        name: repoData.name,
        description: repoData.description || null,
        html_url: repoData.url,
        default_branch: repoData.defaultBranchRef?.name || "main",
        owner: parsed.owner,
        repo: parsed.repo,
      });
    } catch (error) {
      const err = error as Error & { stderr?: string };
      console.error("[import-github][GET] failed to fetch repo info", {
        message: err.message,
        stderr: err.stderr,
        url,
      });

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
        "Failed to fetch repository info: " + (err.message || "Unknown error"),
        "FETCH_FAILED",
      );
    }
  },
  { context: { route: "/api/projects/import-github", method: "GET" } },
);

// POST /api/projects/import-github - Import (clone) a GitHub repo
export const POST = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = await req.json();
      const { url, name: customName, description: customDescription } = body;

      if (!url) {
        throw badRequest("GitHub URL is required", "MISSING_URL");
      }

      const parsed = parseGitHubUrl(url);
      if (!parsed) {
        throw badRequest("Invalid GitHub URL format", "INVALID_URL");
      }

      // Fetch repo info from GitHub
      let repoInfo: GitHubRepoInfo;
      try {
        const { stdout } = await execAsync(
          `gh repo view ${parsed.owner}/${parsed.repo} --json name,description,url,defaultBranchRef`,
          { timeout: 30000 },
        );
        const repoData = JSON.parse(stdout);
        repoInfo = {
          name: repoData.name,
          description: repoData.description || null,
          clone_url: `https://github.com/${parsed.owner}/${parsed.repo}.git`,
          html_url: repoData.url,
          default_branch: repoData.defaultBranchRef?.name || "main",
        };
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
        throw badRequest("Failed to fetch repository info", "FETCH_FAILED");
      }

      // Use custom name/description if provided, otherwise use repo info
      const projectName = customName?.trim() || repoInfo.name;
      const projectDescription =
        customDescription?.trim() || repoInfo.description;

      // Determine workspace path
      const sanitizedName = projectName
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .toLowerCase();
      const workspaceRoot =
        process.env.WORKSPACE_ROOT || path.join(getWorkspacePath(), "projects");
      const workspacePath = path.join(workspaceRoot, sanitizedName);

      // Check if directory already exists
      if (fs.existsSync(workspacePath)) {
        throw badRequest(
          `Directory already exists: ${workspacePath}`,
          "DIR_EXISTS",
        );
      }

      // Ensure parent directory exists
      fs.mkdirSync(workspaceRoot, { recursive: true });

      // Clone the repository using gh CLI
      try {
        await execAsync(
          `gh repo clone ${parsed.owner}/${parsed.repo} "${workspacePath}"`,
          { timeout: 120000 }, // 2 minute timeout for clone
        );
      } catch (error) {
        const err = error as Error & { stderr?: string };
        console.error("Failed to clone repository:", err);

        // Clean up partial clone if it exists
        if (fs.existsSync(workspacePath)) {
          try {
            fs.rmSync(workspacePath, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
        }

        throw badRequest(
          "Failed to clone repository: " +
            (err.stderr || err.message || "Unknown error"),
          "CLONE_FAILED",
        );
      }

      // Create project in database
      const db = await getDb();

      const result = db
        .prepare(
          `
        INSERT INTO projects (name, description, github_repo_url, local_only, auto_provision_workspace, local_path, last_sync_at)
        VALUES (?, ?, ?, 0, 1, ?, CURRENT_TIMESTAMP)
      `,
        )
        .run(projectName, projectDescription, repoInfo.html_url, workspacePath);

      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(result.lastInsertRowid) as Record<string, unknown> | undefined;

      await releaseDb(db);

      return NextResponse.json(
        {
          project: {
            ...project,
            task_count: 0,
          },
          cloned_to: workspacePath,
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, {
        route: "/api/projects/import-github",
        method: "POST",
      });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects/import-github", method: "POST" } },
);
