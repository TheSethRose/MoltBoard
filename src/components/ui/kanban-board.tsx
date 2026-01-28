"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatStatusLabel } from "@/lib/task-statuses";
import { AlertCircle, ArrowUp, Minus, ArrowDown } from "lucide-react";
import { FilterBar } from "./kanban-board/filter-bar";
import { KanbanColumn } from "./kanban-board/kanban-column";
import type {
  KanbanTask,
  KanbanColumn as KanbanColumnType,
  KanbanProject,
} from "./kanban-board/types";

export type {
  KanbanTask,
  KanbanColumn,
  KanbanProject,
} from "./kanban-board/types";

export interface KanbanBoardProps {
  columns: KanbanColumnType[];
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

type BlockedFilter = "all" | "unblocked" | "blocked";

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
  const [columns, setColumns] =
    React.useState<KanbanColumnType[]>(initialColumns);
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
    if (projectFilter !== "all" && task.project_id !== projectFilter) {
      return false;
    }

    if (blockedFilter === "unblocked") {
      if (task.blocked_by && task.blocked_by.length > 0) return false;
    } else if (blockedFilter === "blocked") {
      if (!task.blocked_by || task.blocked_by.length === 0) return false;
    }

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
    e: React.DragEvent,
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

  const [isScrolling, setIsScrolling] = React.useState(false);
  const [scrollStartX, setScrollStartX] = React.useState(0);
  const [scrollStartScrollLeft, setScrollStartScrollLeft] = React.useState(0);

  const handleScrollMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
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
            const aBlocked = a.blocked_by && a.blocked_by.length > 0;
            const bBlocked = b.blocked_by && b.blocked_by.length > 0;
            if (!aBlocked && bBlocked) return -1;
            if (aBlocked && !bBlocked) return 1;

            const priorityOrder: Record<string, number> = {
              urgent: 0,
              high: 1,
              medium: 2,
              low: 3,
            };
            const aPrio = a.priority ? priorityOrder[a.priority] : 4;
            const bPrio = b.priority ? priorityOrder[b.priority] : 4;
            if (aPrio !== bPrio) return aPrio - bPrio;

            if (a.order !== undefined && b.order !== undefined)
              return a.order - b.order;

            return 0;
          });

          return (
            <KanbanColumn
              key={column.id}
              column={column}
              config={config}
              tasks={sortedTasks}
              isDropTarget={dropTarget?.status === column.id}
              draggedTask={draggedTask}
              dropTarget={dropTarget}
              selectedTaskId={selectedTaskId}
              selectedTaskIds={selectedTaskIds}
              onAddClick={() => onAddClick?.(column.id)}
              onSelectColumn={() => onSelectColumn?.(column.id)}
              onDeselectColumn={() => onDeselectColumn?.(column.id)}
              onTaskEdit={(task) => onTaskEdit?.(task)}
              onTaskSelect={(taskId) => onTaskSelect?.(taskId)}
              onDeleteDirect={(taskId) => onDeleteDirect?.(taskId)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              getTagColor={getTagColor}
              getPriorityColor={getPriorityColor}
              getPriorityIcon={getPriorityIcon}
            />
          );
        })}
      </div>
    </div>
  );
}
