import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  badRequest,
  notFound,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

const execFileAsync = promisify(execFile);

async function ensureGitRepo(localPath: string) {
  const gitDir = path.join(localPath, ".git");
  if (!fs.existsSync(gitDir)) {
    throw badRequest("Local path is not a git repository", "NOT_GIT_REPO");
  }
}

export const POST = withErrorHandling(
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
      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId) as
        | {
            id: number;
            name: string;
            local_path: string | null;
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

      if (!project.local_path) {
        throw badRequest("Project does not have a local path", "NO_LOCAL_PATH");
      }

      if (!project.github_repo_url || project.local_only === 1) {
        throw badRequest(
          "Project is not linked to a remote repository",
          "NO_REMOTE_REPO",
        );
      }

      await ensureGitRepo(project.local_path);

      await execFileAsync("git", ["fetch", "origin"], {
        cwd: project.local_path,
        timeout: 60000,
      });

      const { stdout } = await execFileAsync("git", ["pull", "--ff-only"], {
        cwd: project.local_path,
        timeout: 60000,
      });

      return NextResponse.json({
        success: true,
        output: stdout.trim(),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, {
        route: "/api/projects/[id]/pull",
        method: "POST",
      });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/projects/[id]/pull", method: "POST" } },
);
