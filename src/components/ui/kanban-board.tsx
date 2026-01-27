"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatStatusLabel } from "@/lib/task-statuses";
import type { TaskStatus } from "@/types/task";
import {
  Plus,
  X,
  AlertCircle,
  ArrowUp,
  Minus,
  ArrowDown,
  Search,
  Square,
  CheckSquare,
} from "lucide-react";
import { DeleteButton } from "./delete-button";

export interface KanbanTask {
  id: number;
  task_number: number;
  text: string;
  status: TaskStatus;
  tags?: string[];
  priority?: "urgent" | "high" | "medium" | "low" | null;
  order?: number;
  createdAt?: string;
  notes?: string;
  blocked_by?: number[]; // Array of task_numbers this task depends on
  project_id?: number | null;
}

export interface KanbanColumn {
  id: TaskStatus;
  title: string;
  tasks: KanbanTask[];
}

export interface KanbanProject {
  id: number;
  name: string;
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  tagColors?: Record<string, string>;
  priorityColors?: Record<string, string>;
  projects?: KanbanProject[];
  projectFilter?: number | "all";
  onProjectFilterChange?: (projectId: number | "all") => void;
  onTaskMove?: (
    taskId: number,
    fromStatus: KanbanTask["status"],
    toStatus: KanbanTask["status"],
  ) => void;
  onTaskReorder?: (status: KanbanTask["status"], taskIds: number[]) => void;
  onTaskDelete?: (taskId: number) => void;
  /** Direct delete - bypasses confirmation modal */
  onDeleteDirect?: (taskId: number) => void;
  onTaskEdit?: (task: KanbanTask) => void;
  onAddClick?: (status: KanbanTask["status"]) => void;
  onQuickAdd?: (text: string) => void;
  selectedTaskId?: number | null;
  onTaskSelect?: (taskId: number) => void;
  selectedTaskIds?: Set<number>;
  onTaskToggleSelect?: (taskId: number) => void;
  onSelectColumn?: (status: KanbanTask["status"]) => void;
  onDeselectColumn?: (status: KanbanTask["status"]) => void;
  onBulkMove?: (status: KanbanTask["status"]) => void | Promise<void>;
  onBulkDelete?: () => void | Promise<void>;
  className?: string;
}

const DEFAULT_TAG_COLORS: Record<string, string> = {
  bug: "bg-red-500/20 text-red-400 border-red-500/30",
  feature: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  task: "bg-green-500/20 text-green-400 border-green-500/30",
  chore: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  research: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  spike: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  maintenance: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  safety: "bg-red-500/20 text-red-400 border-red-500/30",
  audit: "bg-green-500/20 text-green-400 border-green-500/30",
};

const DEFAULT_PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-green-400",
};

const PRIORITY_ICONS: Record<string, React.ReactNode> = {
  urgent: <AlertCircle size={10} />,
  high: <ArrowUp size={10} />,
  medium: <Minus size={10} />,
  low: <ArrowDown size={10} />,
};

const DEFAULT_STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; color: string }
> = {
  backlog: {
    label: "BACKLOG",
    dot: "bg-slate-500",
    color: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
  ready: {
    label: "READY",
    dot: "bg-green-500",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  "in-progress": {
    label: "IN PROGRESS",
    dot: "bg-blue-500",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  pending: {
    label: "PENDING",
    dot: "bg-amber-500",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  review: {
    label: "REVIEW",
    dot: "bg-violet-500",
    color: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  },
  completed: {
    label: "COMPLETED",
    dot: "bg-emerald-500",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  blocked: {
    label: "BLOCKED",
    dot: "bg-red-500",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

const getStatusConfig = (status: string) =>
  DEFAULT_STATUS_CONFIG[status] || {
    label: formatStatusLabel(status).toUpperCase(),
    dot: "bg-slate-500",
    color: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };

const ALL_TAGS = [
  "bug",
  "feature",
  "task",
  "chore",
  "research",
  "spike",
  "maintenance",
  "safety",
  "audit",
];
const ALL_PRIORITIES = ["urgent", "high", "medium", "low"] as const;

type BlockedFilter = "all" | "unblocked" | "blocked";

function FilterBar({
  tagFilter,
  priorityFilter,
  searchQuery,
  blockedFilter,
  projects,
  projectFilter,
  onTagChange,
  onPriorityChange,
  onSearchChange,
  onBlockedChange,
  onProjectChange,
  onClear,
  tagColors,
}: {
  tagFilter: string[];
  priorityFilter: string[];
  searchQuery: string;
  blockedFilter: BlockedFilter;
  projects?: KanbanProject[];
  projectFilter: number | "all";
  onTagChange: (tag: string) => void;
  onPriorityChange: (priority: string) => void;
  onSearchChange: (query: string) => void;
  onBlockedChange: (filter: BlockedFilter) => void;
  onProjectChange: (projectId: number | "all") => void;
  onClear: () => void;
  tagColors?: Record<string, string>;
}) {
  const hasFilters =
    tagFilter.length > 0 ||
    priorityFilter.length > 0 ||
    searchQuery.length > 0 ||
    blockedFilter !== "all" ||
    projectFilter !== "all";

  return (
    <div className="mb-4 p-3 bg-card/50 border border-border rounded-lg">
      {/* Row 1: Search + Project filter */}
      <div className="flex gap-3 mb-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 py-1.5 text-base md:text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 min-h-[24px] min-w-[24px] flex items-center justify-center touch-action-manipulation"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Project filter dropdown */}
        {projects && projects.length > 0 && (
          <div className="relative min-w-[180px]">
            <select
              value={projectFilter}
              onChange={(e) =>
                onProjectChange(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="w-full px-3 py-1.5 text-base md:text-sm bg-background border border-border rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer touch-action-manipulation"
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
              }}
            >
              <option value="all">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Row 2: Filter chips */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs text-muted-foreground font-medium">
          Filter:
        </span>

        {/* Blocked/Unblocked filter */}
        <div className="flex gap-1">
          <button
            onClick={() =>
              onBlockedChange(
                blockedFilter === "unblocked" ? "all" : "unblocked",
              )
            }
            className={cn(
              "px-2 py-0.5 text-xs rounded border transition-colors",
              blockedFilter === "unblocked"
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-transparent text-muted-foreground border-border hover:bg-accent",
            )}
          >
            Unblocked
          </button>
          <button
            onClick={() =>
              onBlockedChange(blockedFilter === "blocked" ? "all" : "blocked")
            }
            className={cn(
              "px-2 py-0.5 text-xs rounded border transition-colors",
              blockedFilter === "blocked"
                ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                : "bg-transparent text-muted-foreground border-border hover:bg-accent",
            )}
          >
            Blocked
          </button>
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Priority buttons */}
        <div className="flex gap-1">
          {ALL_PRIORITIES.map((p) => {
            const isActive = priorityFilter.includes(p);
            return (
              <button
                key={p}
                onClick={() => onPriorityChange(p)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded border transition-colors",
                  isActive
                    ? DEFAULT_PRIORITY_COLORS[p] + " border-current"
                    : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            );
          })}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Tag buttons */}
        <div className="flex gap-1 flex-wrap">
          {ALL_TAGS.map((tag) => {
            const isActive = tagFilter.includes(tag);
            const colorClass =
              tagColors?.[tag] ||
              DEFAULT_TAG_COLORS[tag] ||
              DEFAULT_TAG_COLORS.task;
            return (
              <button
                key={tag}
                onClick={() => onTagChange(tag)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded border transition-colors",
                  isActive
                    ? colorClass + " border-current"
                    : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {hasFilters && (
          <button
            onClick={onClear}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  columns: initialColumns,
  tagColors = DEFAULT_TAG_COLORS,
  priorityColors = DEFAULT_PRIORITY_COLORS,
  projects = [],
  projectFilter = "all",
  onProjectFilterChange = () => {},
  onTaskMove,
  onTaskReorder,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTaskDelete,
  onDeleteDirect,
  onTaskEdit,
  onAddClick,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onQuickAdd,
  selectedTaskId,
  onTaskSelect,
  selectedTaskIds = new Set(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTaskToggleSelect,
  onSelectColumn = () => {},
  onDeselectColumn = () => {},
  onBulkMove = async () => {},
  onBulkDelete = async () => {},
  className,
}: KanbanBoardProps) {
  const [columns, setColumns] = React.useState<KanbanColumn[]>(initialColumns);
  const [tagFilter, setTagFilter] = React.useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [blockedFilter, setBlockedFilter] =
    React.useState<BlockedFilter>("all");
  const [draggedTask, setDraggedTask] = React.useState<{
    task: KanbanTask;
    sourceStatus: KanbanTask["status"];
    sourceIndex: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{
    status: KanbanTask["status"];
    index: number;
  } | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const statusOptions = React.useMemo(
    () => columns.map((column) => column.id),
    [columns],
  );

  const toggleTagFilter = (tag: string) => {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const togglePriorityFilter = (priority: string) => {
    setPriorityFilter((prev) =>
      prev.includes(priority)
        ? prev.filter((p) => p !== priority)
        : [...prev, priority],
    );
  };

  const clearFilters = () => {
    setTagFilter([]);
    setPriorityFilter([]);
    setSearchQuery("");
    setBlockedFilter("all");
    onProjectFilterChange("all");
  };

  const shouldShowTask = (task: KanbanTask) => {
    // Project filter
    if (projectFilter !== "all" && task.project_id !== projectFilter) {
      return false;
    }

    // Blocked filter
    if (blockedFilter === "unblocked") {
      if (task.blocked_by && task.blocked_by.length > 0) return false;
    } else if (blockedFilter === "blocked") {
      if (!task.blocked_by || task.blocked_by.length === 0) return false;
    }
    // Search filter - case-insensitive text match
    if (searchQuery.length > 0) {
      const searchLower = searchQuery.toLowerCase();
      const matchesText = task.text.toLowerCase().includes(searchLower);
      const matchesTags = task.tags?.some((tag) =>
        tag.toLowerCase().includes(searchLower),
      );
      if (!matchesText && !matchesTags) return false;
    }
    if (
      priorityFilter.length > 0 &&
      task.priority &&
      !priorityFilter.includes(task.priority)
    ) {
      return false;
    }
    if (tagFilter.length > 0 && task.tags) {
      const hasMatchingTag = tagFilter.some((t) => task.tags?.includes(t));
      if (!hasMatchingTag) return false;
    }
    return true;
  };

  const handleDragStart = (
    task: KanbanTask,
    status: KanbanTask["status"],
    index: number,
  ) => {
    setIsScrolling(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = "";
      scrollContainerRef.current.style.userSelect = "";
    }
    setDraggedTask({ task, sourceStatus: status, sourceIndex: index });
  };

  const handleDragOver = (
    e: React.DragEvent,
    status: KanbanTask["status"],
    index: number,
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ status, index });
  };

  const handleDrop = (
    targetStatus: KanbanTask["status"],
    targetIndex: number,
  ) => {
    if (!draggedTask) return;

    const sourceCol = columns.find((c) => c.id === draggedTask.sourceStatus);
    const targetCol = columns.find((c) => c.id === targetStatus);
    if (!sourceCol || !targetCol) return;

    const newSourceTasks = [...sourceCol.tasks];
    const newTargetTasks =
      targetStatus === draggedTask.sourceStatus
        ? newSourceTasks
        : [...targetCol.tasks];
    const [movedTask] = newSourceTasks.splice(draggedTask.sourceIndex, 1);

    if (draggedTask.sourceStatus === targetStatus) {
      newSourceTasks.splice(targetIndex, 0, movedTask);
      const newColumns = columns.map((col) =>
        col.id === targetStatus ? { ...col, tasks: newSourceTasks } : col,
      );
      setColumns(newColumns);
      const taskIds = newSourceTasks.map((t) => t.id);
      onTaskReorder?.(targetStatus, taskIds);
    } else {
      newTargetTasks.splice(targetIndex, 0, {
        ...movedTask,
        status: targetStatus,
      });
      const newColumns = columns.map((col) => {
        if (col.id === draggedTask.sourceStatus)
          return { ...col, tasks: newSourceTasks };
        if (col.id === targetStatus) return { ...col, tasks: newTargetTasks };
        return col;
      });
      setColumns(newColumns);
      onTaskMove?.(movedTask.id, draggedTask.sourceStatus, targetStatus);
    }

    setDraggedTask(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDropTarget(null);
    setIsScrolling(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = "";
      scrollContainerRef.current.style.userSelect = "";
    }
  };

  // Horizontal scroll by dragging
  const [isScrolling, setIsScrolling] = React.useState(false);
  const [scrollStartX, setScrollStartX] = React.useState(0);
  const [scrollStartScrollLeft, setScrollStartScrollLeft] = React.useState(0);

  const handleScrollMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    if (draggedTask) return;
    if (e.target instanceof HTMLElement) {
      if (e.target.closest('[draggable="true"]')) return;
    }
    setIsScrolling(true);
    setScrollStartX(e.clientX);
    setScrollStartScrollLeft(scrollContainerRef.current?.scrollLeft || 0);
    const target = e.currentTarget as HTMLElement;
    target.style.cursor = "grabbing";
    target.style.userSelect = "none";
  };

  const handleScrollMouseMove = (e: React.MouseEvent) => {
    if (!isScrolling || !scrollContainerRef.current) return;
    e.preventDefault();
    const deltaX = e.clientX - scrollStartX;
    scrollContainerRef.current.scrollLeft = scrollStartScrollLeft - deltaX;
  };

  const handleScrollMouseUp = (e: React.MouseEvent) => {
    if (!isScrolling) return;
    setIsScrolling(false);
    const target = e.currentTarget as HTMLElement;
    target.style.cursor = "grab";
    target.style.userSelect = "";
  };

  const getTagColor = (tag: string) =>
    tagColors[tag] || DEFAULT_TAG_COLORS.task;
  const getPriorityColor = (priority: string) =>
    priorityColors[priority] || DEFAULT_PRIORITY_COLORS.low;
  const getPriorityIcon = (priority: string) =>
    PRIORITY_ICONS[priority] || PRIORITY_ICONS.low;

  return (
    <div className={cn("flex flex-col", className)}>
      <FilterBar
        tagFilter={tagFilter}
        priorityFilter={priorityFilter}
        searchQuery={searchQuery}
        blockedFilter={blockedFilter}
        projects={projects}
        projectFilter={projectFilter}
        onTagChange={toggleTagFilter}
        onPriorityChange={togglePriorityFilter}
        onSearchChange={setSearchQuery}
        onBlockedChange={setBlockedFilter}
        onProjectChange={onProjectFilterChange}
        onClear={clearFilters}
        tagColors={tagColors}
      />

      {selectedTaskIds.size > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <select
            onChange={(e) =>
              onBulkMove?.(e.target.value as KanbanTask["status"])
            }
            className="px-3 py-1.5 text-sm rounded border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
            style={{
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
            }}
          >
            <option value="">Move to...</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (confirm(`Delete ${selectedTaskIds.size} selected task(s)?`)) {
                onBulkDelete?.();
              }
            }}
            className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation min-h-[32px]"
          >
            Delete ({selectedTaskIds.size})
          </button>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex flex-row gap-3 overflow-x-auto overflow-y-hidden flex-1 min-h-0 pl-4 pb-2 cursor-grab"
        role="region"
        aria-label="Task board"
        onMouseDown={handleScrollMouseDown}
        onMouseMove={handleScrollMouseMove}
        onMouseUp={handleScrollMouseUp}
        onMouseLeave={handleScrollMouseUp}
      >
        {columns.map((column) => {
          const config = getStatusConfig(column.id);
          const filteredTasks = column.tasks.filter(shouldShowTask);
          const sortedTasks = [...filteredTasks].sort((a, b) => {
            // 1. Unblocked tasks first (no blocked_by or empty array)
            const aBlocked = a.blocked_by && a.blocked_by.length > 0;
            const bBlocked = b.blocked_by && b.blocked_by.length > 0;
            if (!aBlocked && bBlocked) return -1;
            if (aBlocked && !bBlocked) return 1;

            // 2. Priority (urgent > high > medium > low > none)
            const priorityOrder: Record<string, number> = {
              urgent: 0,
              high: 1,
              medium: 2,
              low: 3,
            };
            const aPrio = a.priority ? priorityOrder[a.priority] : 4;
            const bPrio = b.priority ? priorityOrder[b.priority] : 4;
            if (aPrio !== bPrio) return aPrio - bPrio;

            // 3. Sort order (lower first)
            if (a.order !== undefined && b.order !== undefined)
              return a.order - b.order;

            return 0;
          });
          const isCompleted = column.id === "completed";

          return (
            <div
              key={column.id}
              className={cn(
                "rounded-lg p-2 transition-all duration-200 flex flex-col flex-shrink-0 w-[18rem] h-full",
                "bg-card border-2",
                dropTarget?.status === column.id
                  ? "border-primary/50 bg-primary/5"
                  : "border-border",
              )}
            >
              {/* Pinned header */}
              <div className="mb-2 flex items-center justify-between px-1 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onSelectColumn?.(column.id)}
                      className="p-1.5 min-h-[28px] min-w-[28px] rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
                      aria-label={`Select all in ${column.title}`}
                    >
                      <Square size={14} />
                    </button>
                    <button
                      onClick={() => onDeselectColumn?.(column.id)}
                      className="p-1.5 min-h-[28px] min-w-[28px] rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
                      aria-label={`Deselect all in ${column.title}`}
                    >
                      <CheckSquare size={14} />
                    </button>
                  </div>
                  <div
                    className={cn("h-2 w-2 rounded", config.dot)}
                    aria-hidden="true"
                  />
                  <h2 className="text-xs font-[600] text-foreground">
                    {column.title} ({sortedTasks.length}/{column.tasks.length})
                  </h2>
                </div>
                <button
                  onClick={() => onAddClick?.(column.id)}
                  className="p-1.5 min-h-[28px] min-w-[28px] rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 touch-action-manipulation"
                  aria-label={`Add task to ${column.title}`}
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Scrollable task container */}
              <div className="flex flex-col gap-2 min-h-[100px] overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {sortedTasks.map((task, index) => {
                  const isDragging = draggedTask?.task.id === task.id;
                  const isOverTarget =
                    dropTarget?.status === column.id &&
                    dropTarget?.index === index;
                  const isSelected = selectedTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() =>
                        handleDragStart(task, column.id, index)
                      }
                      onDragOver={(e) => handleDragOver(e, column.id, index)}
                      onDrop={(e) => {
                        e.stopPropagation();
                        handleDrop(column.id, index);
                      }}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        onTaskEdit?.(task);
                        onTaskSelect?.(task.id);
                      }}
                      onDoubleClick={() => {
                        onTaskEdit?.(task);
                        onTaskSelect?.(task.id);
                      }}
                      onFocus={() => onTaskSelect?.(task.id)}
                      className={cn(
                        "cursor-grab rounded border border-white/10 bg-card p-2 shadow-sm transition-all duration-150",
                        "hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
                        isDragging && "rotate-2 opacity-50 z-50",
                        isOverTarget &&
                          "border-primary border-dashed scale-105",
                        isCompleted && "opacity-75",
                        selectedTaskIds?.has(task.id) &&
                          "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary",
                        isSelected &&
                          "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary",
                      )}
                      tabIndex={0}
                      aria-label={`Task: ${task.text}${task.priority ? `, priority: ${task.priority}` : ""}`}
                      role="button"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border",
                              config.color,
                            )}
                          >
                            {config.label}
                          </span>
                          {task.priority && (
                            <span
                              className={cn(
                                "flex items-center gap-0.5",
                                getPriorityColor(task.priority),
                              )}
                              aria-label={`Priority: ${task.priority}`}
                            >
                              {getPriorityIcon(task.priority)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const markdown = `### Task #${task.task_number}\n- Status: ${task.status}\n- Priority: ${task.priority || "none"}\n- Tags: ${task.tags?.join(", ") || "none"}\nTitle: ${task.text}\nDescription: ${task.notes || "(no details)"}`;
                            navigator.clipboard.writeText(markdown);
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer mr-1 min-w-[2.5rem] min-h-[24px] flex items-center justify-center touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                          aria-label={`Copy task #${task.task_number} details`}
                        >
                          #{task.task_number > 0 ? task.task_number : "?"}
                        </button>
                        <DeleteButton
                          onDelete={() => onDeleteDirect?.(task.id)}
                          size="sm"
                        />
                      </div>

                      {task.tags && task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {task.tags.map((tag) => (
                            <span
                              key={tag}
                              className={cn(
                                "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium border",
                                getTagColor(tag),
                              )}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-xs text-card-foreground mt-1.5 break-words overflow-hidden">
                        {task.text}
                      </p>

                      {task.blocked_by && task.blocked_by.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-1.5 py-0.5">
                          <span className="font-medium">Blocked by:</span>
                          <span>
                            {task.blocked_by.map((n) => `#${n}`).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {sortedTasks.length === 0 && (
                  <div
                    className="flex min-h-[60px] items-center justify-center text-xs text-muted-foreground border-2 border-dashed border-border/50 rounded"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropTarget({ status: column.id, index: 0 });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(column.id, 0);
                    }}
                    onDragLeave={() => setDropTarget(null)}
                  >
                    {column.tasks.length > 0 ? "No matching tasks" : "No tasks"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
