"use client";

import { useState, useMemo } from "react";
import { Task, Project } from "@/app/(dashboard)/tasks/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Flag,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTaskStatuses, formatStatusLabel } from "@/lib/task-statuses";

type SortField = "order" | "created" | "updated" | "due" | "priority";
type SortDirection = "asc" | "desc";

interface TaskListViewProps {
  tasks: Task[];
  projects?: Project[];
  projectFilter: number | "all";
  onProjectFilterChange: (projectId: number | "all") => void;
  selectedTaskIds: Set<number>;
  onTaskToggleSelect: (taskId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkMove?: (status: Task["status"]) => Promise<void> | void;
  onBulkDelete?: () => Promise<void> | void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: number) => void;
  className?: string;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "order", label: "Task order" },
  { field: "created", label: "Created" },
  { field: "updated", label: "Updated" },
  { field: "due", label: "Due" },
  { field: "priority", label: "Priority" },
];

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function TaskListView({
  tasks,
  projects,
  projectFilter,
  onProjectFilterChange,
  selectedTaskIds,
  onTaskToggleSelect,
  onSelectAll,
  onDeselectAll,
  onBulkMove,
  onBulkDelete,
  onTaskEdit,
  onTaskDelete,
  className,
}: TaskListViewProps) {
  const [sortField, setSortField] = useState<SortField>("order");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [bulkMoveStatus, setBulkMoveStatus] = useState("");
  const statusOptions = getTaskStatuses();

  // Filter tasks by project
  const filteredTasks = useMemo(() => {
    if (projectFilter === "all") return tasks;
    return tasks.filter((task) => task.project_id === projectFilter);
  }, [tasks, projectFilter]);

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "order":
          comparison = (a.order || 0) - (b.order || 0);
          break;
        case "created":
          // Sort by task_number as proxy for creation order
          comparison = a.task_number - b.task_number;
          break;
        case "updated":
          // Sort by task_number as proxy for update order
          comparison = a.task_number - b.task_number;
          break;
        case "due":
          comparison = (a.order || 0) - (b.order || 0); // Fallback to order
          break;
        case "priority":
          comparison =
            (PRIORITY_ORDER[a.priority || "low"] || 4) -
            (PRIORITY_ORDER[b.priority || "low"] || 4);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredTasks, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field)
      return <ArrowUpDown size={14} className="text-muted-foreground" />;
    return sortDirection === "asc" ? (
      <ArrowUp size={14} />
    ) : (
      <ArrowDown size={14} />
    );
  };

  const getProjectName = (projectId: number | null | undefined) => {
    if (!projectId) return null;
    return projects?.find((p) => p.id === projectId)?.name || null;
  };

  const getPriorityClass = (priority: string | null | undefined) => {
    switch (priority) {
      case "urgent":
        return "text-red-500 border-red-500/30 bg-red-500/10";
      case "high":
        return "text-orange-500 border-orange-500/30 bg-orange-500/10";
      case "medium":
        return "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
      case "low":
        return "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
      default:
        return "";
    }
  };

  const allSelected =
    sortedTasks.length > 0 &&
    sortedTasks.every((t) => selectedTaskIds.has(t.id));

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-4">
          {/* Project Filter */}
          {projects && projects.length > 0 && (
            <Select
              value={String(projectFilter)}
              onChange={(e) =>
                onProjectFilterChange(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="w-[180px]"
            >
              <option value="all">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.name}
                </option>
              ))}
            </Select>
          )}

          {/* Selection Actions */}
          {sortedTasks.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAll}
                className="text-xs"
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeselectAll}
                className="text-xs"
              >
                Deselect All
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedTaskIds.size} selected
              </span>
              {selectedTaskIds.size > 0 && (onBulkMove || onBulkDelete) && (
                <div className="flex items-center gap-2">
                  {onBulkMove && (
                    <Select
                      value={bulkMoveStatus}
                      onChange={(e) => {
                        const value = e.target.value as Task["status"] | "";
                        setBulkMoveStatus(value);
                        if (value) {
                          onBulkMove(value);
                          setBulkMoveStatus("");
                        }
                      }}
                      className="h-8 text-xs"
                    >
                      <option value="">Move to…</option>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {formatStatusLabel(status)}
                        </option>
                      ))}
                    </Select>
                  )}
                  {onBulkDelete && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete ${selectedTaskIds.size} selected task(s)?`,
                          )
                        ) {
                          onBulkDelete();
                        }
                      }}
                      className="text-xs"
                    >
                      Delete Selected
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by:</span>
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
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {sortedTasks.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No tasks found
          </div>
        ) : (
          <table className="w-full table-fixed">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="w-10 p-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) =>
                      e.target.checked ? onSelectAll() : onDeselectAll()
                    }
                    className="rounded border-input"
                    aria-label="Select all tasks"
                  />
                </th>
                <th className="p-3 text-left text-sm font-medium">Task</th>
                <th className="w-28 p-3 text-left text-sm font-medium">
                  Status
                </th>
                <th className="w-28 p-3 text-left text-sm font-medium">
                  Priority
                </th>
                <th className="hidden md:table-cell w-40 p-3 text-left text-sm font-medium">
                  Project
                </th>
                <th className="hidden lg:table-cell w-56 p-3 text-left text-sm font-medium">
                  Tags
                </th>
                <th className="w-10 p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedTasks.map((task) => (
                <tr
                  key={task.id}
                  className={cn(
                    "hover:bg-accent/50 transition-colors",
                    selectedTaskIds.has(task.id) && "bg-accent/20",
                  )}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(task.id)}
                      onChange={() => onTaskToggleSelect(task.id)}
                      className="rounded border-input"
                      aria-label={`Select task ${task.task_number}`}
                    />
                  </td>
                  <td className="p-3 min-w-0">
                    <button
                      onClick={() => onTaskEdit(task)}
                      className="text-left hover:text-primary transition-colors w-full"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">
                          #{task.task_number}
                        </span>
                        <span className="font-medium line-clamp-2 min-w-0">
                          {task.text}
                        </span>
                      </div>
                    </button>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">
                      {task.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {task.priority && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs gap-1",
                          getPriorityClass(task.priority),
                        )}
                      >
                        <Flag size={10} />
                        {task.priority}
                      </Badge>
                    )}
                  </td>
                  <td className="hidden md:table-cell p-3">
                    {task.project_id && (
                      <span className="text-sm text-muted-foreground truncate block">
                        {getProjectName(task.project_id)}
                      </span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell p-3">
                    <div className="flex flex-wrap gap-1">
                      {(task.tags || []).slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {(task.tags?.length || 0) > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{(task.tags?.length || 0) - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onTaskDelete(task.id)}
                      className="h-8 w-8 p-0"
                      aria-label="Delete task"
                    >
                      <MoreHorizontal size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with count */}
      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        {sortedTasks.length} task{sortedTasks.length !== 1 ? "s" : ""} •
        {selectedTaskIds.size > 0 && ` ${selectedTaskIds.size} selected`}
      </div>
    </div>
  );
}
