"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { TasksClient } from "@/app/(dashboard)/tasks/tasks-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectDeleteDialog } from "@/components/ui/project-delete-dialog";
import {
  ArrowLeft,
  Github,
  Folder,
  RefreshCw,
  Trash2,
  Loader2,
  Check,
  Search,
  GitBranch,
  CircleDot,
  Shapes,
  Tag,
  ListChecks,
  ArrowUpDown,
  User,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const getRepoFullNameFromUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) return `${match[1]}/${match[2].replace(/\.git$/, "")}`;
  return null;
};

interface Project {
  id: number;
  name: string;
  description: string | null;
  github_repo_url: string | null;
  github_repo_full_name?: string | null;
  github_parent_repo?: string | null;
  local_only: number;
  auto_provision_workspace: number;
  local_path: string | null;
  tech_stack: string | null;
  github_sync_settings: string | null;
  created_at: string;
  updated_at: string;
  task_count: number;
}

interface Task {
  id: number;
  task_number: number;
  text: string;
  status: "backlog" | "ready" | "in-progress" | "completed" | "blocked";
  notes?: string;
  tags?: string[];
  priority?: "urgent" | "high" | "medium" | "low" | null;
  order?: number;
  blocked_by?: number[];
  project_id?: number | null;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: { name: string; color: string }[];
  created_at: string;
  updated_at: string;
  repo_full_name: string;
  assignee?: string | null;
  comments?: number;
  reactions?: number;
  body?: string | null;
  html_url?: string | null;
}

interface SyncSettings {
  mode: "all" | "selected" | "exclude";
  issues: string[];
}

interface ProjectDetailClientProps {
  initialProject: Project;
  initialTasks: Task[];
}

export default function ProjectDetailClient({
  initialProject,
  initialTasks,
}: ProjectDetailClientProps) {
  const params = useParams();
  const router = useRouter();
  const projectId = parseInt(params.id as string);

  const {
    data: projectData,
    error: projectError,
    mutate: mutateProject,
  } = useSWR<{ project: Project }>(`/api/projects/${projectId}`, fetcher, {
    fallbackData: { project: initialProject },
  });

  const { mutate: mutateTasks } = useSWR<{ tasks: Task[] }>(
    `/api/tasks?project_id=${projectId}`,
    fetcher,
    { fallbackData: { tasks: initialTasks } },
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState({
    name: "",
    description: "",
    github_repo_url: "",
    local_only: false,
    auto_provision_workspace: false,
    link_only: false,
  });

  // GitHub sync state
  const [githubIssues, setGithubIssues] = useState<GitHubIssue[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    mode: "all",
    issues: [],
  });
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // GitHub availability state (for the small status indicator)
  const [githubStatus, setGithubStatus] = useState<
    "idle" | "loading" | "available" | "unavailable"
  >("idle");
  const [githubRetryAfter, setGithubRetryAfter] = useState<number | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [issueQuery, setIssueQuery] = useState("");
  const [issueStateFilter, setIssueStateFilter] = useState<
    "all" | "open" | "closed"
  >("open");
  const [issueRepoFilter, setIssueRepoFilter] = useState<string>("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState<Set<string>>(
    new Set(),
  );
  const [issueTagFilter, setIssueTagFilter] = useState<Set<string>>(new Set());
  const [issueAssigneeFilter, setIssueAssigneeFilter] = useState<
    "all" | "assigned" | "unassigned"
  >("unassigned");
  const [isPulling, setIsPulling] = useState(false);
  const [issueSortBy, setIssueSortBy] = useState<
    "created" | "updated" | "comments" | "reactions"
  >("created");
  const [issueSortOrder, setIssueSortOrder] = useState<"newest" | "oldest">(
    "newest",
  );

  const project = projectData?.project;
  const tasks = initialTasks;

  const normalizedQuery = issueQuery.trim().toLowerCase();
  const normalizeLabel = (label: string) => label.trim();
  const normalizeKey = (label: string) => normalizeLabel(label).toLowerCase();
  const typePrefixes = ["type:", "kind:", "category:"];
  const commonTypeLabels = new Set([
    "bug",
    "feature",
    "enhancement",
    "chore",
    "docs",
    "documentation",
    "refactor",
    "perf",
    "performance",
    "test",
    "tests",
    "ci",
    "build",
    "maintenance",
    "security",
    "support",
  ]);

  const getTypeKey = (label: string) => {
    const normalized = normalizeLabel(label);
    const lower = normalized.toLowerCase();
    const prefix = typePrefixes.find((p) => lower.startsWith(p));
    if (prefix) {
      const value = normalized.slice(prefix.length).trim();
      return value ? value.toLowerCase() : null;
    }
    if (commonTypeLabels.has(lower)) return lower;
    return null;
  };

  const getTypeDisplay = (label: string, typeKey: string) => {
    const normalized = normalizeLabel(label);
    const lower = normalized.toLowerCase();
    const prefix = typePrefixes.find((p) => lower.startsWith(p));
    if (prefix) {
      const value = normalized.slice(prefix.length).trim();
      return value || typeKey;
    }
    return normalized;
  };

  const typeOptions = Array.from(
    githubIssues.reduce((acc, issue) => {
      issue.labels.forEach((label) => {
        const typeKey = getTypeKey(label.name);
        if (typeKey) {
          acc.set(typeKey, getTypeDisplay(label.name, typeKey));
        }
      });
      return acc;
    }, new Map<string, string>()),
  )
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const tagOptions = Array.from(
    githubIssues.reduce((acc, issue) => {
      issue.labels.forEach((label) => {
        const labelKey = normalizeKey(label.name);
        if (!getTypeKey(label.name)) {
          acc.set(labelKey, label.name);
        }
      });
      return acc;
    }, new Map<string, string>()),
  )
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const filteredIssues = githubIssues.filter((issue) => {
    if (issueStateFilter !== "all" && issue.state !== issueStateFilter)
      return false;
    if (issueRepoFilter !== "all" && issue.repo_full_name !== issueRepoFilter)
      return false;
    if (
      issueAssigneeFilter === "assigned" &&
      (!issue.assignee || issue.assignee.trim() === "")
    )
      return false;
    if (
      issueAssigneeFilter === "unassigned" &&
      issue.assignee &&
      issue.assignee.trim() !== ""
    )
      return false;
    if (issueTypeFilter.size > 0) {
      const issueTypes = new Set(
        issue.labels
          .map((label) => getTypeKey(label.name))
          .filter(Boolean) as string[],
      );
      const hasType = Array.from(issueTypeFilter).some((type) =>
        issueTypes.has(type),
      );
      if (!hasType) return false;
    }
    if (issueTagFilter.size > 0) {
      const issueTags = new Set(
        issue.labels.map((label) => normalizeKey(label.name)),
      );
      const hasTag = Array.from(issueTagFilter).some((tag) =>
        issueTags.has(tag),
      );
      if (!hasTag) return false;
    }
    if (!normalizedQuery) return true;
    const numberMatch = `#${issue.number}`.includes(normalizedQuery);
    const titleMatch = issue.title.toLowerCase().includes(normalizedQuery);
    const repoMatch = issue.repo_full_name
      .toLowerCase()
      .includes(normalizedQuery);
    return numberMatch || titleMatch || repoMatch;
  });

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    let diff = 0;
    switch (issueSortBy) {
      case "created":
        diff =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "updated":
        diff =
          new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        break;
      case "comments":
        diff = (a.comments || 0) - (b.comments || 0);
        break;
      case "reactions":
        diff = (a.reactions || 0) - (b.reactions || 0);
        break;
    }
    return issueSortOrder === "newest" ? -diff : diff;
  });

  // Parse sync settings from project
  useEffect(() => {
    if (project?.github_sync_settings) {
      try {
        const settings = JSON.parse(
          project.github_sync_settings,
        ) as SyncSettings & { issues: (string | number)[] };
        const defaultRepo =
          getRepoFullNameFromUrl(project?.github_repo_url) || "";
        const normalizedIssues = (settings.issues || []).map((issue) => {
          if (typeof issue === "number" && defaultRepo)
            return `${defaultRepo}#${issue}`;
          return String(issue);
        });
        const normalizedSettings: SyncSettings = {
          mode: settings.mode,
          issues: normalizedIssues,
        };
        setSyncSettings(normalizedSettings);
        if (settings.mode === "selected") {
          setSelectedIssues(new Set(normalizedIssues));
        }
      } catch {
        setSyncSettings({ mode: "all", issues: [] });
      }
    }
  }, [project?.github_repo_url, project?.github_sync_settings]);

  const handleDeleteConfirm = async (cascade: "metadata" | "tasks" | "all") => {
    if (!project) return;

    try {
      const res = await fetch(`/api/projects/${projectId}?cascade=${cascade}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Project "${project.name}" deleted`);
        if (data.deleted.tasksDeleted > 0) {
          toast.info(`${data.deleted.tasksDeleted} task(s) deleted`);
        }
        if (data.deleted.tasksOrphaned > 0) {
          toast.info(`${data.deleted.tasksOrphaned} task(s) unassigned`);
        }
        if (data.deleted.filesDeleted) {
          toast.info("Local files deleted");
        }
        if (data.deleted.filesError) {
          toast.warning(`Files not deleted: ${data.deleted.filesError}`);
        }
        router.push("/projects");
      } else {
        toast.error(data.error?.message || "Failed to delete project");
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
      toast.error("Failed to delete project");
    }
  };

  useEffect(() => {
    if (project) {
      setEditProject({
        name: project.name,
        description: project.description || "",
        github_repo_url: project.github_repo_url || "",
        local_only: project.local_only === 1,
        auto_provision_workspace: project.auto_provision_workspace === 1,
        link_only: false,
      });
    }
  }, [project]);

  const handleSaveSettings = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editProject),
      });

      if (res.ok) {
        mutateProject();
        setIsSettingsOpen(false);
        toast.success("Project updated");
      }
    } catch {
      toast.error("Failed to update project");
    }
  };

  // Fetch GitHub issues - responsible API call with proper state management
  const fetchGitHubIssues = async (isRetry = false) => {
    if (!project?.github_repo_url) return;

    // If rate limited and not a manual retry, don't fetch
    if (githubRetryAfter && Date.now() < githubRetryAfter && !isRetry) {
      return;
    }

    setIsLoadingIssues(true);
    setGithubStatus("loading");
    if (isRetry) setSyncError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/github-issues`);
      const data = await res.json();

      // Mark that we've attempted a fetch (prevents infinite retries on mount)
      setHasFetchedOnce(true);

      // Handle rate limit (429) or rate limit flag in response
      if (res.status === 429 || data.rateLimited) {
        const retryAfterSec = data.retryAfter || data.error?.retryAfter || 60;
        setGithubRetryAfter(Date.now() + retryAfterSec * 1000);
        setGithubStatus("unavailable");

        // If we got cached/stale data, still use it
        if (data.issues && data.issues.length > 0) {
          setGithubIssues(data.issues);
          if (syncSettings.mode === "selected") {
            setSelectedIssues(new Set(syncSettings.issues));
          }
        }
        return;
      }

      if (res.ok) {
        setGithubIssues(data.issues || []);
        setGithubRetryAfter(null);
        setGithubStatus("available");
        // Pre-select based on current settings
        if (syncSettings.mode === "selected") {
          setSelectedIssues(new Set(syncSettings.issues));
        } else {
          setSelectedIssues(new Set());
        }
      } else {
        setGithubStatus("unavailable");
        // Set retry time for non-rate-limit errors too (backoff)
        if (!githubRetryAfter) {
          setGithubRetryAfter(Date.now() + 30000); // 30s backoff for other errors
        }
      }
    } catch {
      setGithubStatus("unavailable");
      if (!githubRetryAfter) {
        setGithubRetryAfter(Date.now() + 30000);
      }
    } finally {
      setIsLoadingIssues(false);
    }
  };

  const openSyncDialog = () => {
    setSyncError(null);
    setIsSyncDialogOpen(true);
  };

  // Retry handler for the status indicator
  const handleGitHubRetry = () => {
    setGithubRetryAfter(null);
    fetchGitHubIssues(true);
  };

  const handlePullLatest = async () => {
    if (!project) return;
    setIsPulling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/pull`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message || "Failed to pull latest changes");
        return;
      }
      toast.success(data.output || "Repo is up to date");
    } catch {
      toast.error("Failed to pull latest changes");
    } finally {
      setIsPulling(false);
    }
  };

  const toggleIssue = (issueKey: string) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueKey)) {
        next.delete(issueKey);
      } else {
        next.add(issueKey);
      }
      return next;
    });
  };

  const selectAll = () => {
    const visibleIds = filteredIssues.map(
      (i) => `${i.repo_full_name}#${i.number}`,
    );
    setSelectedIssues((prev) => new Set([...prev, ...visibleIds]));
  };

  const deselectAll = () => {
    const hasActiveFilters =
      normalizedQuery.length > 0 ||
      issueStateFilter !== "all" ||
      issueRepoFilter !== "all" ||
      issueTypeFilter.size > 0 ||
      issueTagFilter.size > 0;

    if (!hasActiveFilters) {
      setSelectedIssues(new Set());
      return;
    }

    const visibleIds = new Set(
      filteredIssues.map((i) => `${i.repo_full_name}#${i.number}`),
    );
    setSelectedIssues(
      (prev) => new Set([...prev].filter((id) => !visibleIds.has(id))),
    );
  };

  const clearAllSelections = () => {
    setSelectedIssues(new Set());
  };

  const toggleTypeFilter = (typeKey: string) => {
    setIssueTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(typeKey)) {
        next.delete(typeKey);
      } else {
        next.add(typeKey);
      }
      return next;
    });
  };

  const toggleTagFilter = (tagKey: string) => {
    setIssueTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tagKey)) {
        next.delete(tagKey);
      } else {
        next.add(tagKey);
      }
      return next;
    });
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      // First save the sync settings
      const newSettings: SyncSettings = {
        mode: selectedIssues.size === githubIssues.length ? "all" : "selected",
        issues: Array.from(selectedIssues),
      };

      // Update project with new sync settings
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          github_sync_settings: JSON.stringify(newSettings),
        }),
      });

      // Now perform the sync with selected issues
      const res = await fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issues: Array.from(selectedIssues).map((key) => {
            const [repoFullName, number] = key.split("#");
            return { repo: repoFullName, number: parseInt(number, 10) };
          }),
        }),
      });

      const data = await res.json();

      if (res.ok || data.success) {
        mutateTasks();
        mutateProject();
        toast.success(
          `Imported: ${data.sync?.created || 0} created, ${data.sync?.updated || 0} updated`,
        );
        setIsSyncDialogOpen(false);
      } else {
        setSyncError(data.error?.message || data.error || "Sync failed");
      }
    } catch {
      setSyncError("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // Pre-load GitHub issues ONCE on mount
  // hasFetchedOnce ensures we only try once - no infinite loops
  useEffect(() => {
    if (!project?.github_repo_url) return;
    if (hasFetchedOnce) return;
    if (isLoadingIssues) return;
    fetchGitHubIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.github_repo_url]);

  if (projectError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Failed to load project</div>
      </div>
    );
  }

  const formatLocalPath = (localPath?: string | null) => {
    if (!localPath) return "";
    if (localPath.startsWith("/Users/")) {
      const parts = localPath.split("/");
      if (parts.length > 2) {
        return `~/${parts.slice(3).join("/")}`;
      }
    }
    return localPath.replace(
      /^(\/Users\/[^/]+)(\/?.*)$/,
      (_, _home, rest) => `~${rest || ""}`,
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="mb-6">
        {/* Back Navigation */}
        <div className="flex items-center gap-4 mb-4">
          <Link href="/projects" className="min-h-[24px]">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} className="mr-2" />
              Back to Projects
            </Button>
          </Link>
        </div>

        {/* Project Title and Description */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="text-2xl font-bold text-card-foreground tracking-tight"
              style={{ textWrap: "balance" }}
            >
              {project?.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              </Badge>
              {project?.local_only ? (
                <Badge>Local Only</Badge>
              ) : (
                <Badge>Cloud</Badge>
              )}
            </div>
          </div>
          {project?.description && (
            <p className="text-muted-foreground text-base max-w-2xl line-clamp-2">
              {project.description}
            </p>
          )}
        </div>

        {/* Project Meta Row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm text-muted-foreground">
          {project?.github_repo_url && (
            <a
              href={project.github_repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Github size={14} className="shrink-0" />
              <span className="truncate max-w-[200px]">
                {project.github_repo_full_name ||
                  project.github_repo_url.replace("https://github.com/", "")}
              </span>
            </a>
          )}
          {project?.github_parent_repo && (
            <a
              href={`https://github.com/${project.github_parent_repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github size={14} className="shrink-0" />
              <span className="truncate max-w-[200px]">
                Parent: {project.github_parent_repo}
              </span>
            </a>
          )}
          {project?.local_path && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(project.local_path!);
                  toast.success("Copied path");
                } catch {
                  toast.error("Failed to copy path");
                }
              }}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              aria-label="Copy local path"
            >
              <Folder size={14} className="shrink-0" />
              <span className="font-mono text-xs break-all">
                {formatLocalPath(project.local_path)}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Action Bar */}
      <div className="flex items-center justify-end gap-2 mb-4">
        {/* GitHub status indicator */}
        {project?.github_repo_url && githubStatus === "unavailable" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
            <span className="text-amber-500">●</span>
            <span>GitHub unavailable</span>
            <button
              type="button"
              onClick={handleGitHubRetry}
              disabled={
                isLoadingIssues ||
                (githubRetryAfter !== null && Date.now() < githubRetryAfter)
              }
              className="text-primary hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {isLoadingIssues
                ? "..."
                : githubRetryAfter && Date.now() < githubRetryAfter
                  ? `Retry in ${Math.ceil((githubRetryAfter - Date.now()) / 1000)}s`
                  : "Retry"}
            </button>
          </div>
        )}
        {project?.github_repo_url && githubStatus === "loading" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            <span>Loading issues...</span>
          </div>
        )}
        {project?.github_repo_url && (
          <Button variant="outline" size="sm" onClick={openSyncDialog}>
            <RefreshCw size={14} className="mr-2" />
            Import Github Issues
          </Button>
        )}
        {project?.github_repo_url &&
          project?.local_path &&
          !project.local_only && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePullLatest}
              disabled={isPulling}
            >
              <RefreshCw
                size={14}
                className={isPulling ? "mr-2 animate-spin" : "mr-2"}
              />
              Pull Latest
            </Button>
          )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsSettingsOpen(true)}
        >
          Settings
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDeleteOpen(true)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
        >
          <Trash2 size={14} className="mr-2" />
          Delete
        </Button>
      </div>

      {/* Task Board - using shared TasksClient */}
      <div className="flex-1 min-h-0">
        <TasksClient
          initialTasks={initialTasks}
          projectId={projectId}
          hideProjectFilter={true}
        />
      </div>

      {/* GitHub Issue Import Dialog */}
      <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <DialogContent className="bg-card border-border w-[calc(100%-2rem)] sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-7">
          <DialogHeader>
            <DialogTitle>Import Github Issues</DialogTitle>
            <DialogDescription>
              Select which issues to import as tasks. Your selection will be
              remembered for future imports.
            </DialogDescription>
          </DialogHeader>

          {isSyncing && (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 size={14} className="animate-spin" />
              Importing issues…
            </div>
          )}

          {githubStatus === "unavailable" && (
            <div
              className="p-3 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm flex items-center justify-between gap-2"
              role="alert"
            >
              <span>
                GitHub is currently unavailable.
                {githubIssues.length > 0
                  ? " Showing cached issues."
                  : " Please try again later."}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGitHubRetry}
                disabled={isLoadingIssues}
                className="shrink-0"
              >
                {isLoadingIssues ? "Retrying..." : "Retry"}
              </Button>
            </div>
          )}
          {syncError && (
            <div
              className="p-3 rounded-md bg-destructive/10 text-destructive text-sm"
              role="alert"
            >
              {syncError}
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col md:flex-row">
            {/* Left column: Options + Filters */}
            <div className="space-y-6 py-2 pr-0 md:pr-8 md:flex-[2_1_0%] md:min-w-0">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,200px]">
                  <div className="space-y-1">
                    <Label
                      htmlFor="issue-search"
                      className="text-sm font-medium text-foreground mb-2 flex items-center gap-2"
                    >
                      <Search size={14} className="text-muted-foreground" />
                      Search
                    </Label>
                    <Input
                      id="issue-search"
                      value={issueQuery}
                      onChange={(e) => setIssueQuery(e.target.value)}
                      placeholder="Search title or #number…"
                      disabled={isLoadingIssues}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="issue-repo"
                      className="text-sm font-medium text-foreground mb-2 flex items-center gap-2"
                    >
                      <GitBranch size={14} className="text-muted-foreground" />
                      Repository
                    </Label>
                    <select
                      id="issue-repo"
                      value={issueRepoFilter}
                      onChange={(e) => setIssueRepoFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
                      disabled={isLoadingIssues}
                    >
                      <option value="all">All repositories</option>
                      {Array.from(
                        new Set(githubIssues.map((i) => i.repo_full_name)),
                      ).map((repo) => (
                        <option key={repo} value={repo}>
                          {repo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <CircleDot size={14} className="text-muted-foreground" />
                    State
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: "all", label: "All" },
                        { key: "open", label: "Open" },
                        { key: "closed", label: "Closed" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setIssueStateFilter(option.key)}
                        disabled={isLoadingIssues}
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-full border transition-colors min-h-[32px]",
                          issueStateFilter === option.key
                            ? "bg-primary/20 text-primary border-primary/40"
                            : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <User size={14} className="text-muted-foreground" />
                    Assignee
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: "all", label: "All" },
                        { key: "assigned", label: "Assigned" },
                        { key: "unassigned", label: "Unassigned" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setIssueAssigneeFilter(option.key)}
                        disabled={isLoadingIssues}
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-full border transition-colors min-h-[32px]",
                          issueAssigneeFilter === option.key
                            ? "bg-primary/20 text-primary border-primary/40"
                            : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Shapes size={14} className="text-muted-foreground" />
                    Types
                  </Label>
                  {typeOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No type labels found
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {typeOptions.map((type) => (
                        <button
                          key={type.key}
                          type="button"
                          onClick={() => toggleTypeFilter(type.key)}
                          disabled={isLoadingIssues}
                          className={cn(
                            "px-3 py-1.5 text-xs rounded-full border transition-colors min-h-[32px]",
                            issueTypeFilter.has(type.key)
                              ? "bg-primary/20 text-primary border-primary/40"
                              : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                          )}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Tag size={14} className="text-muted-foreground" />
                    Tags
                  </Label>
                  {tagOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No tag labels found
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tagOptions.map((tag) => (
                        <button
                          key={tag.key}
                          type="button"
                          onClick={() => toggleTagFilter(tag.key)}
                          disabled={isLoadingIssues}
                          className={cn(
                            "px-3 py-1.5 text-xs rounded-full border transition-colors min-h-[32px]",
                            issueTagFilter.has(tag.key)
                              ? "bg-primary/20 text-primary border-primary/40"
                              : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                          )}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <ArrowUpDown size={14} className="text-muted-foreground" />
                    Sort
                  </Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,120px]">
                    <select
                      value={issueSortBy}
                      onChange={(e) =>
                        setIssueSortBy(
                          e.target.value as
                            | "created"
                            | "updated"
                            | "comments"
                            | "reactions",
                        )
                      }
                      className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
                      disabled={isLoadingIssues}
                    >
                      <option value="created">Created on</option>
                      <option value="updated">Last updated</option>
                      <option value="comments">Total comments</option>
                      <option value="reactions"># Reactions</option>
                    </select>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { key: "newest", label: "Newest" },
                          { key: "oldest", label: "Oldest" },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setIssueSortOrder(option.key)}
                          disabled={isLoadingIssues}
                          className={cn(
                            "px-3 py-1.5 text-xs rounded-full border transition-colors min-h-[32px]",
                            issueSortOrder === option.key
                              ? "bg-primary/20 text-primary border-primary/40"
                              : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: Issues list */}
            <div className="border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6 flex flex-col min-h-[280px] md:flex-[3_1_0%] md:min-w-0 md:min-h-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ListChecks size={14} className="text-muted-foreground" />
                  <span className="text-sm font-medium">Issues</span>
                  <button
                    type="button"
                    onClick={handleGitHubRetry}
                    disabled={isLoadingIssues}
                    className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    aria-label="Refresh issues"
                  >
                    <RefreshCw
                      size={12}
                      className={isLoadingIssues ? "animate-spin" : ""}
                    />
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {selectedIssues.size} of {githubIssues.length} selected ·
                  Showing {filteredIssues.length}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                    disabled={isLoadingIssues || filteredIssues.length === 0}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deselectAll}
                    disabled={isLoadingIssues || filteredIssues.length === 0}
                  >
                    Deselect All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllSelections}
                    disabled={isLoadingIssues || selectedIssues.size === 0}
                  >
                    Clear all selections
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible">
                {isLoadingIssues ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 size={24} className="animate-spin" />
                    <span className="ml-2">Loading issues…</span>
                  </div>
                ) : filteredIssues.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    No issues match your filters
                  </div>
                ) : (
                  <div className="space-y-1 py-2">
                    {sortedIssues.map((issue) => {
                      const issueKey = `${issue.repo_full_name}#${issue.number}`;
                      const isSelected = selectedIssues.has(issueKey);
                      const issueTypes = issue.labels
                        .map((label) => {
                          const typeKey = getTypeKey(label.name);
                          return typeKey
                            ? getTypeDisplay(label.name, typeKey)
                            : null;
                        })
                        .filter(Boolean) as string[];
                      const issueTags = issue.labels
                        .filter((label) => !getTypeKey(label.name))
                        .map((label) => label.name);
                      return (
                        <button
                          key={issueKey}
                          onClick={() => toggleIssue(issueKey)}
                          className={cn(
                            "group relative w-full flex items-start gap-3 p-2 rounded-md text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-accent border border-transparent",
                          )}
                        >
                          <div
                            className={cn(
                              "flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center mt-0.5",
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isSelected && <Check size={12} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {issue.html_url ? (
                                <a
                                  href={issue.html_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
                                >
                                  #{issue.number}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground font-mono">
                                  #{issue.number}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground truncate">
                                {issue.repo_full_name}
                              </span>
                              <span
                                className={cn(
                                  "text-xs px-1.5 py-0.5 rounded",
                                  issue.state === "open"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-purple-500/20 text-purple-400",
                                )}
                              >
                                {issue.state}
                              </span>
                            </div>
                            <p className="text-sm text-foreground truncate">
                              {issue.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <User
                                  size={12}
                                  className="text-muted-foreground"
                                />
                                <span>
                                  {issue.assignee
                                    ? issue.assignee
                                    : "Unassigned"}
                                </span>
                              </div>
                              {typeof issue.comments === "number" && (
                                <span>· {issue.comments} comments</span>
                              )}
                              {typeof issue.reactions === "number" && (
                                <span>· {issue.reactions} reactions</span>
                              )}
                            </div>
                            {issueTypes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {issueTypes.slice(0, 3).map((type) => (
                                  <span
                                    key={type}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                                  >
                                    {type}
                                  </span>
                                ))}
                                {issueTypes.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{issueTypes.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                            {issueTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {issueTags.slice(0, 3).map((label) => (
                                  <span
                                    key={label}
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor:
                                        "rgba(148, 163, 184, 0.16)",
                                      color: "var(--muted-foreground)",
                                    }}
                                  >
                                    {label}
                                  </span>
                                ))}
                                {issueTags.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{issueTags.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="pointer-events-none group-hover:pointer-events-auto absolute right-3 top-2 z-20 w-80 max-w-[75vw] rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg opacity-0 invisible transition-opacity duration-200 delay-1000 group-hover:opacity-100 group-hover:visible">
                            <div className="text-sm font-medium text-foreground mb-1">
                              {issue.title}
                            </div>
                            <div className="text-xs text-muted-foreground mb-2">
                              #{issue.number} · {issue.repo_full_name} ·{" "}
                              {issue.state}
                            </div>
                            <div className="text-xs text-muted-foreground mb-2">
                              Assignee:{" "}
                              {issue.assignee ? issue.assignee : "Unassigned"}
                              {typeof issue.comments === "number" && (
                                <span> · {issue.comments} comments</span>
                              )}
                              {typeof issue.reactions === "number" && (
                                <span> · {issue.reactions} reactions</span>
                              )}
                            </div>
                            <div className="text-xs text-foreground/90 whitespace-pre-wrap break-words max-h-72 overflow-y-auto overscroll-contain pr-1">
                              {issue.body?.trim()
                                ? issue.body
                                : "No description provided."}
                            </div>
                            {issue.labels.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-3">
                                {issue.labels.slice(0, 8).map((label) => (
                                  <span
                                    key={label.name}
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: `#${label.color}20`,
                                      color: `#${label.color}`,
                                    }}
                                  >
                                    {label.name}
                                  </span>
                                ))}
                                {issue.labels.length > 8 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{issue.labels.length - 8} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-[10px] text-muted-foreground mt-3">
                                No labels
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSyncDialogOpen(false)}
              disabled={isSyncing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSync}
              disabled={
                isSyncing || selectedIssues.size === 0 || isLoadingIssues
              }
            >
              {isSyncing ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${selectedIssues.size} Issue${selectedIssues.size !== 1 ? "s" : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={editProject.name}
                onChange={(e) =>
                  setEditProject({ ...editProject, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={editProject.description}
                onChange={(e) =>
                  setEditProject({
                    ...editProject,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github_repo_url">GitHub Repository URL</Label>
              <Input
                id="github_repo_url"
                value={editProject.github_repo_url}
                onChange={(e) =>
                  setEditProject({
                    ...editProject,
                    github_repo_url: e.target.value,
                  })
                }
                placeholder="https://github.com/username/repo"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="local_only"
                checked={editProject.local_only}
                onChange={(e) =>
                  setEditProject({
                    ...editProject,
                    local_only: e.target.checked,
                  })
                }
                className="rounded border-gray-300"
              />
              <Label htmlFor="local_only">Local only (no cloud sync)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="auto_provision_workspace"
                checked={editProject.auto_provision_workspace}
                onChange={(e) =>
                  setEditProject({
                    ...editProject,
                    auto_provision_workspace: e.target.checked,
                  })
                }
                className="rounded border-gray-300"
              />
              <Label htmlFor="auto_provision_workspace">
                Auto-provision workspace directory
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="link_only"
                checked={editProject.link_only}
                onChange={(e) =>
                  setEditProject({
                    ...editProject,
                    link_only: e.target.checked,
                  })
                }
                className="rounded border-gray-300"
              />
              <Label htmlFor="link_only">Link only (do not clone/fetch)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Dialog */}
      {project && (
        <ProjectDeleteDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          projectName={project.name}
          taskCount={tasks.length}
          hasLocalPath={Boolean(project.local_path)}
          localPath={project.local_path}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
