"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  Github,
  MoreHorizontal,
} from "lucide-react";
import { ProjectDeleteDialog } from "@/components/ui/project-delete-dialog";
import { PinButton } from "@/components/ui/pin-button";
import { cn } from "@/lib/utils";

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
  tags?: string[];
}

type SortField = "name" | "tasks" | "created" | "updated" | "sync";
type SortDirection = "asc" | "desc";

interface ProjectListViewProps {
  projects: Project[];
  onEditClick: (project: Project) => void;
  onDeleteClick: (project: Project) => void;
  className?: string;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "tasks", label: "Task count" },
  { field: "created", label: "Created" },
  { field: "updated", label: "Updated" },
  { field: "sync", label: "Last sync" },
];

export function ProjectListView({
  projects,
  onEditClick,
  onDeleteClick,
  className,
}: ProjectListViewProps) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "local" | "cloud">("all");

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = project.name.toLowerCase().includes(query);
        const matchesDescription = project.description?.toLowerCase().includes(query) ?? false;
        const matchesRepo = project.github_repo_full_name?.toLowerCase().includes(query) ?? false;
        if (!matchesName && !matchesDescription && !matchesRepo) {
          return false;
        }
      }

      // Type filter
      if (filterType === "local" && !project.local_only) return false;
      if (filterType === "cloud" && project.local_only) return false;

      return true;
    });
  }, [projects, searchQuery, filterType]);

  // Sort projects
  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "tasks":
          comparison = a.task_count - b.task_count;
          break;
        case "created":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "updated":
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case "sync":
          const aSync = a.last_sync_at ? new Date(a.last_sync_at).getTime() : 0;
          const bSync = b.last_sync_at ? new Date(b.last_sync_at).getTime() : 0;
          comparison = aSync - bSync;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredProjects, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-muted-foreground" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp size={14} />
    ) : (
      <ArrowDown size={14} />
    );
  };

  // Format last sync time
  const formatLastSync = (lastSyncAt: string | null): string => {
    if (!lastSyncAt) return "Never";
    const date = new Date(lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  };

  // Get delete dialog state
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const handleDeleteClick = (project: Project) => {
    setDeleteProject(project);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async (cascade: "metadata" | "tasks" | "all") => {
    if (!deleteProject) return;
    // The actual delete logic is handled by the parent component
    // This just closes the dialog
    setIsDeleteOpen(false);
    setDeleteProject(null);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-4">
          {/* Search */}
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[200px] md:w-[280px]"
          />

          {/* Type Filter */}
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as "all" | "local" | "cloud")}
            className="w-[140px]"
          >
            <option value="all">All types</option>
            <option value="cloud">Cloud</option>
            <option value="local">Local</option>
          </Select>

          {/* Count */}
          <span className="text-sm text-muted-foreground">
            {sortedProjects.length} project{sortedProjects.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground hidden md:inline">Sort by:</span>
          {SORT_OPTIONS.map((option) => (
            <Button
              key={option.field}
              variant="ghost"
              size="sm"
              onClick={() => toggleSort(option.field)}
              className={cn(
                "text-xs gap-1",
                sortField === option.field && "bg-accent",
              )}
            >
              {getSortIcon(option.field)}
              <span className="hidden sm:inline">{option.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {sortedProjects.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No projects found
          </div>
        ) : (
          <table className="w-full table-fixed">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="p-3 text-left text-sm font-medium">Project</th>
                <th className="w-28 p-3 text-left text-sm font-medium hidden md:table-cell">
                  Type
                </th>
                <th className="w-24 p-3 text-left text-sm font-medium hidden lg:table-cell">
                  Tasks
                </th>
                <th className="w-32 p-3 text-left text-sm font-medium hidden xl:table-cell">
                  Last Sync
                </th>
                <th className="w-40 p-3 text-left text-sm font-medium hidden 2xl:table-cell">
                  Repository
                </th>
                <th className="w-24 p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedProjects.map((project) => (
                <tr
                  key={project.id}
                  className="hover:bg-accent/50 transition-colors"
                >
                  <td className="p-3 min-w-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block min-w-0 hover:text-primary transition-colors"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-medium truncate block">
                          {project.name}
                        </span>
                      </div>
                      {project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {project.description}
                        </p>
                      )}
                    </Link>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    {project.local_only ? (
                      <Badge variant="secondary" className="text-xs">
                        Local
                      </Badge>
                    ) : (
                      <Badge className="text-xs">Cloud</Badge>
                    )}
                  </td>
                  <td className="p-3 hidden lg:table-cell">
                    <span
                      className="text-sm text-muted-foreground"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {project.task_count}
                    </span>
                  </td>
                  <td className="p-3 hidden xl:table-cell">
                    <div
                      className="flex items-center gap-1 text-sm text-muted-foreground"
                      title={project.last_sync_at || undefined}
                    >
                      <Clock size={14} />
                      <span>{formatLastSync(project.last_sync_at)}</span>
                    </div>
                  </td>
                  <td className="p-3 hidden 2xl:table-cell">
                    {project.github_repo_url && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
                        <Github size={14} className="shrink-0" />
                        <span className="truncate block">
                          {project.github_repo_full_name ||
                            project.github_repo_url.replace(
                              "https://github.com/",
                              "",
                            )}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditClick(project)}
                        className="h-8 px-2"
                        aria-label="Edit project"
                      >
                        Settings
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(project)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label="Delete project"
                      >
                        <MoreHorizontal size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        {sortedProjects.length} project{sortedProjects.length !== 1 ? "s" : ""}
      </div>

      {/* Delete Dialog */}
      {deleteProject && (
        <ProjectDeleteDialog
          open={isDeleteOpen}
          onOpenChange={(open) => {
            setIsDeleteOpen(open);
            if (!open) {
              setDeleteProject(null);
            }
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
