"use client";

import { useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectDeleteDialog } from "@/components/ui/project-delete-dialog";
import { PinButton } from "@/components/ui/pin-button";
import { Clock, Trash2, Github, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Format last sync time with locale-aware formatting and redundant cues
function formatLastSync(lastSyncAt: string | null): {
  text: string;
  icon: React.ReactNode;
  label: string;
} {
  if (!lastSyncAt) {
    return {
      text: "Never synced",
      icon: <Clock size={14} className="text-muted-foreground" />,
      label: "Never synced",
    };
  }

  const date = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Use locale-aware formatting
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  let text: string;
  let label: string;
  const iconClass = "text-muted-foreground";

  if (diffMins < 1) {
    text = "Just now";
    label = `Synced ${formatted}`;
  } else if (diffMins < 60) {
    text = `${diffMins}m ago`;
    label = `Synced ${formatted}`;
  } else if (diffHours < 24) {
    text = `${diffHours}h ago`;
    label = `Synced ${formatted}`;
  } else if (diffDays < 7) {
    text = `${diffDays}d ago`;
    label = `Synced ${formatted}`;
  } else {
    text = formatted;
    label = `Last sync: ${formatted}`;
  }

  return {
    text,
    icon: <Clock size={14} className={iconClass} />,
    label,
  };
}

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
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  task_count: number;
  open_task_count?: number;
  closed_task_count?: number;
  tags?: string[];
}

interface ProjectsResponse {
  projects: Project[];
}

export default function ProjectsClient() {
  const { mutate } = useSWRConfig();
  const { data, error, isLoading } = useSWR<ProjectsResponse>(
    "/api/projects",
    fetcher,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    github_repo_url: "",
    local_only: false,
    auto_provision_workspace: false,
    link_only: false,
  });
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    github_repo_url: "",
    local_only: false,
    auto_provision_workspace: false,
    link_only: false,
  });
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Import from GitHub state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importInfo, setImportInfo] = useState<{
    name: string;
    description: string | null;
    owner: string;
    repo: string;
  } | null>(null);
  const [importName, setImportName] = useState("");
  const [importDescription, setImportDescription] = useState("");
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleDeleteClick = (project: Project) => {
    setDeleteProject(project);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async (cascade: "metadata" | "tasks" | "all") => {
    if (!deleteProject) return;

    try {
      const res = await fetch(
        `/api/projects/${deleteProject.id}?cascade=${cascade}`,
        {
          method: "DELETE",
        },
      );

      const data = await res.json();

      if (res.ok) {
        toast.success(`Project "${deleteProject.name}" deleted`);
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
        mutate("/api/projects");
        setIsDeleteOpen(false);
        setDeleteProject(null);
      } else {
        toast.error(data.error?.message || "Failed to delete project");
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
      toast.error("Failed to delete project");
    }
  };

  const resetImportState = () => {
    setImportUrl("");
    setImportInfo(null);
    setImportName("");
    setImportDescription("");
    setImportError(null);
    setIsFetchingInfo(false);
    setIsImporting(false);
  };

  const handleFetchRepoInfo = async () => {
    if (!importUrl.trim()) return;

    setIsFetchingInfo(true);
    setImportError(null);

    try {
      const res = await fetch(
        `/api/projects/import-github?url=${encodeURIComponent(importUrl.trim())}`,
      );
      const data = await res.json();

      if (!res.ok) {
        setImportError(
          data.error?.message || "Failed to fetch repository info",
        );
        return;
      }

      setImportInfo(data);
      setImportName(data.name);
      setImportDescription(data.description || "");
    } catch (err) {
      console.error("Failed to fetch repo info:", err);
      setImportError("Failed to fetch repository info");
    } finally {
      setIsFetchingInfo(false);
    }
  };

  const handleImportProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importInfo) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const res = await fetch("/api/projects/import-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: importUrl.trim(),
          name: importName.trim(),
          description: importDescription.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error?.message || "Failed to import repository");
        return;
      }

      toast.success(`Project "${data.project.name}" imported`);
      toast.info(`Cloned to ${data.cloned_to}`);
      resetImportState();
      setIsImportOpen(false);
      mutate("/api/projects");
    } catch (err) {
      console.error("Failed to import project:", err);
      setImportError("Failed to import repository");
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProject),
      });

      if (res.ok) {
        setNewProject({
          name: "",
          description: "",
          github_repo_url: "",
          local_only: false,
          auto_provision_workspace: false,
          link_only: false,
        });
        setIsCreateOpen(false);
        mutate("/api/projects");
      }
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  const handleEditClick = (project: Project) => {
    setEditingProject(project);
    setEditForm({
      name: project.name,
      description: project.description || "",
      github_repo_url: project.github_repo_url || "",
      local_only: Boolean(project.local_only),
      auto_provision_workspace: Boolean(project.auto_provision_workspace),
      link_only: false,
    });
    setIsEditOpen(true);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    try {
      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        setIsEditOpen(false);
        setEditingProject(null);
        mutate("/api/projects");
      }
    } catch (err) {
      console.error("Failed to update project:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading projects...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Failed to load projects</div>
      </div>
    );
  }

  const projects = data?.projects || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your Projects</h2>
          <p className="text-sm text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog
            open={isImportOpen}
            onOpenChange={(open) => {
              setIsImportOpen(open);
              if (!open) resetImportState();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <Github size={16} className="mr-2" />
                Import from GitHub
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import from GitHub</DialogTitle>
              </DialogHeader>
              {(isFetchingInfo || isImporting) && (
                <div
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 size={14} className="animate-spin" />
                  {isImporting
                    ? "Import in progress…"
                    : "Fetching repository info…"}
                </div>
              )}
              <form onSubmit={handleImportProject} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="import-url">GitHub Repository URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="import-url"
                      value={importUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setImportUrl(e.target.value);
                        setImportInfo(null);
                        setImportError(null);
                      }}
                      placeholder="owner/repo or https://github.com/…"
                      disabled={isFetchingInfo || isImporting}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleFetchRepoInfo}
                      disabled={
                        !importUrl.trim() || isFetchingInfo || isImporting
                      }
                    >
                      {isFetchingInfo ? (
                        <>
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          Fetching…
                        </>
                      ) : (
                        "Fetch Info"
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enter a GitHub URL or owner/repo format
                  </p>
                </div>

                {importError && (
                  <div
                    className="p-3 rounded-md bg-destructive/10 text-destructive text-sm"
                    role="alert"
                  >
                    {importError}
                  </div>
                )}

                {importInfo && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="import-name">Project Name</Label>
                      <Input
                        id="import-name"
                        value={importName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setImportName(e.target.value)
                        }
                        placeholder="Project name…"
                        required
                        disabled={isImporting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="import-description">Description</Label>
                      <Input
                        id="import-description"
                        value={importDescription}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setImportDescription(e.target.value)
                        }
                        placeholder="Project description…"
                        disabled={isImporting}
                      />
                    </div>
                    <div className="p-3 rounded-md bg-muted text-sm">
                      <p className="text-muted-foreground">
                        This will clone{" "}
                        <strong>
                          {importInfo.owner}/{importInfo.repo}
                        </strong>{" "}
                        to your workspace and create a new project.
                      </p>
                    </div>
                  </>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsImportOpen(false);
                      resetImportState();
                    }}
                    disabled={isImporting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!importInfo || !importName.trim() || isImporting}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Importing…
                      </>
                    ) : (
                      "Import Project"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>New Project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    value={newProject.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewProject({ ...newProject, name: e.target.value })
                    }
                    placeholder="My Awesome Project"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    value={newProject.description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewProject({
                        ...newProject,
                        description: e.target.value,
                      })
                    }
                    placeholder="What is this project about?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github_repo_url">
                    GitHub Repository URL (optional)
                  </Label>
                  <Input
                    id="github_repo_url"
                    type="url"
                    value={newProject.github_repo_url}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewProject({
                        ...newProject,
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
                    checked={newProject.local_only}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewProject({
                        ...newProject,
                        local_only: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-action-manipulation"
                  />
                  <Label htmlFor="local_only">Local only (no cloud sync)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="auto_provision_workspace"
                    checked={newProject.auto_provision_workspace}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewProject({
                        ...newProject,
                        auto_provision_workspace: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-action-manipulation"
                  />
                  <Label htmlFor="auto_provision_workspace">
                    Auto-provision workspace directory
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="link_only"
                    checked={newProject.link_only}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewProject({
                        ...newProject,
                        link_only: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-action-manipulation"
                  />
                  <Label htmlFor="link_only">
                    Link only (do not clone/fetch)
                  </Label>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="default">
                    Create Project
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Edit Project Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <span />
              {/* Hidden trigger - opened programmatically */}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Project</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpdateProject} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Project Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    placeholder="My Awesome Project"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">
                    Description (optional)
                  </Label>
                  <Input
                    id="edit-description"
                    value={editForm.description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    placeholder="What is this project about?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-github_repo_url">
                    GitHub Repository URL (optional)
                  </Label>
                  <Input
                    id="edit-github_repo_url"
                    type="url"
                    value={editForm.github_repo_url}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm({
                        ...editForm,
                        github_repo_url: e.target.value,
                      })
                    }
                    placeholder="https://github.com/username/repo"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit-local_only"
                    checked={editForm.local_only}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm({ ...editForm, local_only: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-action-manipulation"
                  />
                  <Label htmlFor="edit-local_only">
                    Local only (no cloud sync)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit-auto_provision_workspace"
                    checked={editForm.auto_provision_workspace}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm({
                        ...editForm,
                        auto_provision_workspace: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-action-manipulation"
                  />
                  <Label htmlFor="edit-auto_provision_workspace">
                    Auto-provision workspace directory
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit-link_only"
                    checked={editForm.link_only}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm({ ...editForm, link_only: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-action-manipulation"
                  />
                  <Label htmlFor="edit-link_only">
                    Link only (do not clone/fetch)
                  </Label>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="default">
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-border rounded-lg">
          <div className="text-center">
            <p className="text-muted-foreground mb-2">No projects yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first project to get started
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-3">
                  <span className="truncate min-w-0">{project.name}</span>
                  {project.local_only ? (
                    <Badge variant="secondary">Local</Badge>
                  ) : (
                    <Badge>Cloud</Badge>
                  )}
                </CardTitle>
                <CardDescription
                  className="line-clamp-2 min-h-[2.5rem]"
                  aria-hidden={!project.description}
                >
                  {project.description ?? "\u00A0"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5 text-sm">
                  {project.github_repo_url && (
                    <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                      <svg
                        className="h-4 w-4 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                      <span className="truncate min-w-0">
                        {project.github_repo_full_name ||
                          project.github_repo_url.replace(
                            "https://github.com/",
                            "",
                          )}
                      </span>
                    </div>
                  )}
                  {project.github_parent_repo && (
                    <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                      <svg
                        className="h-4 w-4 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                      <span className="truncate min-w-0">
                        Parent: {project.github_parent_repo}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg
                      className="h-4 w-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {project.task_count} task
                      {project.task_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {project.auto_provision_workspace && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <svg
                        className="h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                      </svg>
                      <span>Auto-provision enabled</span>
                    </div>
                  )}
                  {/* Sync Status Indicator */}
                  {(() => {
                    const sync = formatLastSync(project.last_sync_at);
                    return (
                      <div
                        className="flex items-center gap-2 text-muted-foreground"
                        title={sync.label}
                      >
                        <span className="shrink-0">{sync.icon}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {sync.text}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="min-h-[24px]"
                  >
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </Link>
                  <PinButton
                    projectId={project.id}
                    projectName={project.name}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditClick(project)}
                  >
                    Settings
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(project)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Project Dialog */}
      {deleteProject && (
        <ProjectDeleteDialog
          open={isDeleteOpen}
          onOpenChange={(open) => {
            setIsDeleteOpen(open);
            if (!open) setDeleteProject(null);
          }}
          projectName={deleteProject.name}
          taskCount={deleteProject.task_count}
          hasLocalPath={Boolean(deleteProject.local_path)}
          localPath={deleteProject.local_path}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
