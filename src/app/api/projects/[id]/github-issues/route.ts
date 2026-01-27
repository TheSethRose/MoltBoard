import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  badRequest,
  notFound,
} from "@/lib/api-error-handler";

// In-memory cache to prevent hammering GitHub API
const issueCache = new Map<
  string,
  { issues: GitHubIssue[]; timestamp: number; rateLimitReset?: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_BACKOFF_MS = 60 * 1000; // 1 minute minimum backoff when rate limited

// Track rate limit state globally
let globalRateLimitUntil: number | null = null;

interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: { name: string; color: string }[];
  created_at: string;
  updated_at: string;
  body?: string | null;
  html_url?: string | null;
  assignee?: { login?: string } | null;
  comments?: number;
  reactions?: { total_count?: number };
}

interface TransformedIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: { name: string; color: string }[];
  created_at: string;
  updated_at: string;
  repo_full_name: string;
  body?: string | null;
  html_url?: string | null;
  assignee?: string | null;
  comments?: number;
  reactions?: number;
}

function parseGitHubRepoUrl(
  url: string,
): { owner: string; repo: string } | null {
  if (url.includes("github.com/")) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
  }
  return null;
}

async function fetchGitHubIssues(
  owner: string,
  repo: string,
  token: string,
): Promise<{
  issues: GitHubIssue[];
  rateLimitReset?: number;
  rateLimitRemaining?: number;
}> {
  const allIssues: GitHubIssue[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;
  let rateLimitReset: number | undefined;
  let rateLimitRemaining: number | undefined;

  while (hasMore && page <= 10) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    // Parse rate limit headers
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    if (remaining) rateLimitRemaining = parseInt(remaining, 10);
    if (reset) rateLimitReset = parseInt(reset, 10) * 1000; // Convert to ms

    if (response.status === 403 || response.status === 429) {
      // Rate limited
      const resetTime = rateLimitReset || Date.now() + RATE_LIMIT_BACKOFF_MS;
      globalRateLimitUntil = resetTime;
      throw Object.assign(new Error("GitHub API rate limit exceeded"), {
        code: "GITHUB_RATE_LIMIT",
        resetTime,
      });
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw Object.assign(new Error("GitHub authentication failed"), {
          code: "GITHUB_AUTH_ERROR",
        });
      }
      if (response.status === 404) {
        throw Object.assign(
          new Error(`Repository not found: ${owner}/${repo}`),
          { code: "GITHUB_REPO_NOT_FOUND" },
        );
      }
      const errorData = await response.json().catch(() => ({}));
      throw Object.assign(
        new Error(errorData.message || `GitHub API error: ${response.status}`),
        { code: "GITHUB_API_ERROR" },
      );
    }

    const pageIssues = (await response.json()) as GitHubIssue[];
    // Filter out pull requests
    const issuesOnly = pageIssues.filter(
      (issue) => !(issue as unknown as { pull_request?: unknown }).pull_request,
    );
    allIssues.push(...issuesOnly);

    if (pageIssues.length < perPage) {
      hasMore = false;
    }
    page++;

    // Stop early if we're running low on rate limit
    if (rateLimitRemaining !== undefined && rateLimitRemaining < 10) {
      console.warn(
        `[github-issues] Low rate limit (${rateLimitRemaining}), stopping pagination early`,
      );
      break;
    }
  }

  return { issues: allIssues, rateLimitReset, rateLimitRemaining };
}

export const GET = withErrorHandling(
  async (
    _req: NextRequest,
    context?: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const routeParams = await context?.params;
    const projectId = parseInt(routeParams?.id ?? "", 10);

    if (isNaN(projectId)) {
      throw badRequest("Invalid project ID", "INVALID_PROJECT_ID");
    }

    // Check global rate limit before doing anything
    if (globalRateLimitUntil && Date.now() < globalRateLimitUntil) {
      const waitSeconds = Math.ceil((globalRateLimitUntil - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: {
            code: "GITHUB_RATE_LIMIT",
            message: `GitHub rate limit exceeded. Try again in ${waitSeconds} seconds.`,
            retryAfter: waitSeconds,
          },
          issues: [], // Return empty array so UI can still function
          cached: false,
          rateLimited: true,
        },
        { status: 429 },
      );
    }

    const db = getDb();

    try {
      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId) as
        | {
            id: number;
            name: string;
            github_repo_url: string | null;
            github_parent_repo?: string | null;
          }
        | undefined;

      if (!project) {
        throw notFound(
          `Project with id ${projectId} not found`,
          "PROJECT_NOT_FOUND",
        );
      }

      if (!project.github_repo_url) {
        throw badRequest(
          "Project does not have a GitHub repository configured",
          "NO_GITHUB_REPO",
        );
      }

      const parsed = parseGitHubRepoUrl(project.github_repo_url);
      if (!parsed) {
        throw badRequest(
          "Could not parse GitHub repository URL",
          "INVALID_GITHUB_URL",
        );
      }

      const { owner, repo } = parsed;
      const repoFullName = `${owner}/${repo}`;

      // Check cache first
      const cacheKey = `${projectId}:${repoFullName}`;
      const cached = issueCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        // Check if cache was from a rate limit period that's now over
        if (!cached.rateLimitReset || Date.now() > cached.rateLimitReset) {
          return NextResponse.json({
            issues: cached.issues,
            cached: true,
            cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000),
          });
        }
      }

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken || githubToken.trim() === "") {
        throw badRequest(
          "GITHUB_TOKEN environment variable is not set",
          "NO_GITHUB_TOKEN",
        );
      }

      // Fetch from primary repo
      const allIssues: TransformedIssue[] = [];

      try {
        const { issues, rateLimitReset } = await fetchGitHubIssues(
          owner,
          repo,
          githubToken,
        );
        const transformed = issues.map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          labels: issue.labels || [],
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          repo_full_name: repoFullName,
          body: issue.body,
          html_url: issue.html_url,
          assignee: issue.assignee?.login || null,
          comments: issue.comments,
          reactions: issue.reactions?.total_count,
        }));
        allIssues.push(...transformed);

        // Also fetch from parent repo if this is a fork
        if (project.github_parent_repo) {
          const parentParsed = parseGitHubRepoUrl(
            `https://github.com/${project.github_parent_repo}`,
          );
          if (parentParsed) {
            try {
              const parentResult = await fetchGitHubIssues(
                parentParsed.owner,
                parentParsed.repo,
                githubToken,
              );
              const parentTransformed = parentResult.issues.map((issue) => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                labels: issue.labels || [],
                created_at: issue.created_at,
                updated_at: issue.updated_at,
                repo_full_name: project.github_parent_repo!,
                body: issue.body,
                html_url: issue.html_url,
                assignee: issue.assignee?.login || null,
                comments: issue.comments,
                reactions: issue.reactions?.total_count,
              }));
              allIssues.push(...parentTransformed);
            } catch (parentErr) {
              // Don't fail if parent repo fetch fails, just log it
              console.warn(
                `[github-issues] Failed to fetch parent repo issues: ${(parentErr as Error).message}`,
              );
            }
          }
        }

        // Update cache
        issueCache.set(cacheKey, {
          issues: allIssues as unknown as GitHubIssue[],
          timestamp: Date.now(),
          rateLimitReset,
        });

        // Clear global rate limit if we succeeded
        globalRateLimitUntil = null;

        return NextResponse.json({
          issues: allIssues,
          cached: false,
        });
      } catch (fetchErr) {
        const err = fetchErr as Error & { code?: string; resetTime?: number };

        if (err.code === "GITHUB_RATE_LIMIT") {
          const waitSeconds = err.resetTime
            ? Math.ceil((err.resetTime - Date.now()) / 1000)
            : 60;

          // Return cached data if available, even if stale
          if (cached) {
            return NextResponse.json({
              issues: cached.issues,
              cached: true,
              stale: true,
              rateLimited: true,
              retryAfter: waitSeconds,
              message: `Using cached data. GitHub rate limit exceeded, try again in ${waitSeconds}s.`,
            });
          }

          return NextResponse.json(
            {
              error: {
                code: "GITHUB_RATE_LIMIT",
                message: `GitHub rate limit exceeded. Try again in ${waitSeconds} seconds.`,
                retryAfter: waitSeconds,
              },
              issues: [],
              rateLimited: true,
            },
            { status: 429 },
          );
        }

        throw badRequest(err.message, err.code || "GITHUB_API_ERROR");
      }
    } finally {
      releaseDb(db);
    }
  },
  { context: { route: "/api/projects/[id]/github-issues", method: "GET" } },
);
