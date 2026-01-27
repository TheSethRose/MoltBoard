import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { withErrorHandling, logError } from "@/lib/api-error-handler";
import { getWorkspacePath } from "@/lib/workspace-path";

const execAsync = promisify(exec);

// GET - Fetch git status
export const GET = withErrorHandling(
  async (): Promise<NextResponse> => {
    try {
      const workspacePath = getWorkspacePath();
      const { stdout: gitStatus } = await execAsync(
        `cd ${workspacePath} && git status --porcelain 2>&1 | head -10`,
      );
      const changes = gitStatus
        .trim()
        .split("\n")
        .filter((l) => l).length;
      const status = changes > 0 ? `${changes} uncommitted` : "clean";

      return NextResponse.json({
        git: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logError(error as Error, { route: "/api/status/git", method: "GET" });
      return NextResponse.json({
        git: "not a repo",
        timestamp: new Date().toISOString(),
      });
    }
  },
  { context: { route: "/api/status/git", method: "GET" } },
);
