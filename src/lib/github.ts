/**
 * GitHub API utilities with rate limiting and caching
 *
 * All GitHub API calls should go through this module to ensure:
 * - Rate limit detection and backoff
 * - Caching to reduce API calls
 * - Consistent error handling
 * - Graceful degradation when API is unavailable
 */

// Global rate limit state
let rateLimitUntil: number | null = null;
let rateLimitRemaining: number | null = null;

// In-memory cache for repo metadata (reduces API calls significantly)
const repoMetadataCache = new Map<
  string,
  { data: RepoMetadata | null; timestamp: number }
>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface RepoMetadata {
  full_name: string;
  fork: boolean;
  parent?: { full_name: string };
}

export interface GitHubApiResult<T> {
  data: T | null;
  error: GitHubError | null;
  cached: boolean;
  rateLimited: boolean;
}

export interface GitHubError {
  code: "RATE_LIMIT" | "AUTH_ERROR" | "NOT_FOUND" | "API_ERROR" | "NO_TOKEN";
  message: string;
  retryAfter?: number;
}

/**
 * Check if we're currently rate limited
 */
export function isRateLimited(): boolean {
  if (!rateLimitUntil) return false;
  if (Date.now() >= rateLimitUntil) {
    rateLimitUntil = null;
    return false;
  }
  return true;
}

/**
 * Get seconds until rate limit resets
 */
export function getRateLimitRetryAfter(): number | null {
  if (!rateLimitUntil) return null;
  const remaining = Math.ceil((rateLimitUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : null;
}

/**
 * Get remaining rate limit quota (if known)
 */
export function getRateLimitRemaining(): number | null {
  return rateLimitRemaining;
}

/**
 * Parse rate limit headers from GitHub response
 */
function parseRateLimitHeaders(headers: Headers): void {
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");

  if (remaining !== null) {
    rateLimitRemaining = parseInt(remaining, 10);
  }

  if (reset !== null) {
    const resetTimestamp = parseInt(reset, 10) * 1000;
    // Only update if this is a rate limit situation
    if (rateLimitRemaining !== null && rateLimitRemaining <= 0) {
      rateLimitUntil = resetTimestamp;
    }
  }
}

/**
 * Make a rate-limit-aware request to GitHub API
 */
async function githubFetch<T>(
  url: string,
  token: string,
  options: { skipCache?: boolean } = {},
): Promise<GitHubApiResult<T>> {
  // Check rate limit before making request
  if (isRateLimited()) {
    const retryAfter = getRateLimitRetryAfter();
    return {
      data: null,
      error: {
        code: "RATE_LIMIT",
        message: `GitHub API rate limited. Retry in ${retryAfter}s.`,
        retryAfter: retryAfter ?? undefined,
      },
      cached: false,
      rateLimited: true,
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Dashboard/1.0",
      },
    });

    // Parse rate limit headers
    parseRateLimitHeaders(response.headers);

    // Handle rate limit responses
    if (response.status === 403 || response.status === 429) {
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const resetTime = resetHeader
        ? parseInt(resetHeader, 10) * 1000
        : Date.now() + 60000;
      rateLimitUntil = resetTime;

      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      return {
        data: null,
        error: {
          code: "RATE_LIMIT",
          message: `GitHub API rate limit exceeded. Retry in ${retryAfter}s.`,
          retryAfter,
        },
        cached: false,
        rateLimited: true,
      };
    }

    // Handle auth errors
    if (response.status === 401) {
      return {
        data: null,
        error: {
          code: "AUTH_ERROR",
          message: "GitHub authentication failed. Check GITHUB_TOKEN.",
        },
        cached: false,
        rateLimited: false,
      };
    }

    // Handle not found
    if (response.status === 404) {
      return {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Repository not found.",
        },
        cached: false,
        rateLimited: false,
      };
    }

    // Handle other errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: {
          code: "API_ERROR",
          message: (errorData as { message?: string }).message || `GitHub API error: ${response.status}`,
        },
        cached: false,
        rateLimited: false,
      };
    }

    // Success - clear rate limit state
    if (rateLimitRemaining && rateLimitRemaining > 10) {
      rateLimitUntil = null;
    }

    const data = (await response.json()) as T;
    return {
      data,
      error: null,
      cached: false,
      rateLimited: false,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        code: "API_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      rateLimited: false,
    };
  }
}

/**
 * Fetch repository metadata with caching
 * This is the main function to use for getting repo info (fork status, parent repo, etc.)
 */
export async function fetchRepoMetadata(
  owner: string,
  repo: string,
  token?: string,
): Promise<GitHubApiResult<RepoMetadata>> {
  const cacheKey = `${owner}/${repo}`;

  // Check cache first
  const cached = repoMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      data: cached.data,
      error: null,
      cached: true,
      rateLimited: false,
    };
  }

  // No token = can't fetch
  if (!token || token.trim() === "") {
    return {
      data: null,
      error: {
        code: "NO_TOKEN",
        message: "GITHUB_TOKEN not configured.",
      },
      cached: false,
      rateLimited: false,
    };
  }

  const result = await githubFetch<RepoMetadata>(
    `https://api.github.com/repos/${owner}/${repo}`,
    token,
  );

  // Cache successful results (and null results to avoid hammering for non-existent repos)
  if (!result.rateLimited) {
    repoMetadataCache.set(cacheKey, {
      data: result.data,
      timestamp: Date.now(),
    });
  }

  // If rate limited but we have stale cache, return it
  if (result.rateLimited && cached) {
    return {
      data: cached.data,
      error: result.error,
      cached: true,
      rateLimited: true,
    };
  }

  return result;
}

/**
 * Fetch issues from a repository
 */
export async function fetchRepoIssues(
  owner: string,
  repo: string,
  token: string,
  options: {
    state?: "open" | "closed" | "all";
    perPage?: number;
    maxPages?: number;
  } = {},
): Promise<GitHubApiResult<GitHubIssue[]>> {
  const { state = "open", perPage = 100, maxPages = 10 } = options;

  if (isRateLimited()) {
    const retryAfter = getRateLimitRetryAfter();
    return {
      data: null,
      error: {
        code: "RATE_LIMIT",
        message: `GitHub API rate limited. Retry in ${retryAfter}s.`,
        retryAfter: retryAfter ?? undefined,
      },
      cached: false,
      rateLimited: true,
    };
  }

  const allIssues: GitHubIssue[] = [];
  let page = 1;

  while (page <= maxPages) {
    // Check remaining quota before each page
    if (rateLimitRemaining !== null && rateLimitRemaining < 5) {
      console.warn(
        `[github] Low rate limit (${rateLimitRemaining}), stopping pagination early`,
      );
      break;
    }

    const result = await githubFetch<GitHubIssue[]>(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}`,
      token,
    );

    if (result.error) {
      // If we got some issues before the error, return what we have
      if (allIssues.length > 0) {
        return {
          data: allIssues,
          error: result.error,
          cached: false,
          rateLimited: result.rateLimited,
        };
      }
      return result as GitHubApiResult<GitHubIssue[]>;
    }

    const issues = result.data || [];
    // Filter out pull requests
    const realIssues = issues.filter((i) => !i.pull_request);
    allIssues.push(...realIssues);

    // Stop if we got fewer than requested (last page)
    if (issues.length < perPage) {
      break;
    }

    page++;
  }

  return {
    data: allIssues,
    error: null,
    cached: false,
    rateLimited: false,
  };
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels?: Array<{ name: string; color?: string }>;
  pull_request?: unknown;
  html_url?: string;
  assignee?: { login?: string } | null;
  comments?: number;
  reactions?: { total_count?: number };
  created_at?: string;
  updated_at?: string;
}

/**
 * Clear the cache (useful for testing or forcing refresh)
 */
export function clearCache(): void {
  repoMetadataCache.clear();
}

/**
 * Get cache stats (for debugging)
 */
export function getCacheStats(): { size: number; rateLimited: boolean; retryAfter: number | null } {
  return {
    size: repoMetadataCache.size,
    rateLimited: isRateLimited(),
    retryAfter: getRateLimitRetryAfter(),
  };
}
