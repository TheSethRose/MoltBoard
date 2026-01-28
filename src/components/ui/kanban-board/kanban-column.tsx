"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type {
  KanbanTask,
  KanbanColumn as KanbanColumnType,
} from "./types";
import { TaskCard } from "./task-card";
import { CheckSquare, Square, Plus, ClipboardList } from "lucide-react";

interface KanbanColumnProps {
  column: KanbanColumnType;
  config: {
    label: string;
    dot: string;
    color: string;
  };
  tasks: KanbanTask[];
  isDropTarget?: boolean;
  draggedTask: {
    task: KanbanTask;
    sourceStatus: KanbanTask["status"];
    sourceIndex: number;
  } | null;
  dropTarget: {
    status: KanbanTask["status"];
    index: number;
  } | null;
  selectedTaskId?: number | null;
  selectedTaskIds?: Set<number>;
  onAddClick: () => void;
  onSelectColumn: () => void;
  onDeselectColumn: () => void;
  onTaskEdit: (task: KanbanTask) => void;
  onTaskSelect: (taskId: number) => void;
  onDeleteDirect: (taskId: number) => void;
  onDragStart: (
    task: KanbanTask,
    status: KanbanTask["status"],
    index: number,
  ) => void;
  onDragOver: (
    e: React.DragEvent,
    status: KanbanTask["status"],
    index: number,
  ) => void;
  onDrop: (
    e: React.DragEvent,
    status: KanbanTask["status"],
    index: number,
  ) => void;
  onDragEnd: () => void;
  getTagColor: (tag: string) => string;
  getPriorityColor: (priority: string) => string;
  getPriorityIcon: (priority: string) => React.ReactNode;
}

export function KanbanColumn({
  column,
  config,
  tasks,
  isDropTarget,
  draggedTask,
  dropTarget,
  selectedTaskId,
  selectedTaskIds,
  onAddClick,
  onSelectColumn,
  onDeselectColumn,
  onTaskEdit,
  onTaskSelect,
  onDeleteDirect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  getTagColor,
  getPriorityColor,
  getPriorityIcon,
}: KanbanColumnProps) {
  const isCompleted = column.id === "completed";

  return (
    <div
      className={cn(
        "rounded-lg p-2 transition-all duration-200 flex flex-col flex-shrink-0 w-[18rem] h-full",
        "bg-card border-2",
        isDropTarget ? "border-primary/50 bg-primary/5" : "border-border",
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onDeselectColumn}
              className="p-1.5 min-h-[28px] min-w-[28px] rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
              aria-label={`Select all in ${column.title}`}
            >
              <Square size={14} />
            </button>
            <button
              onClick={onSelectColumn}
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
            {column.title} ({tasks.length}/{column.tasks.length})
          </h2>
        </div>
        <button
          onClick={onAddClick}
          className="p-1.5 min-h-[28px] min-w-[28px] rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 touch-action-manipulation"
          aria-label={`Add task to ${column.title}`}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-2 min-h-[100px] overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {tasks.map((task, index) => {
          const isDragging = draggedTask?.task.id === task.id;
          const isOverTarget =
            dropTarget?.status === column.id && dropTarget?.index === index;
          const isSelected =
            selectedTaskId === task.id || selectedTaskIds?.has(task.id);

          return (
            <TaskCard
              key={task.id}
              task={task}
              config={config}
              isDragging={isDragging}
              isOverTarget={isOverTarget}
              isSelected={isSelected}
              isCompleted={isCompleted}
              onEdit={() => onTaskEdit(task)}
              onSelect={() => onTaskSelect(task.id)}
              onDelete={() => onDeleteDirect(task.id)}
              onDragStart={() => onDragStart(task, column.id, index)}
              onDragOver={(e) => onDragOver(e, column.id, index)}
              onDrop={(e) => onDrop(e, column.id, index)}
              onDragEnd={onDragEnd}
              getTagColor={getTagColor}
              getPriorityColor={getPriorityColor}
              getPriorityIcon={getPriorityIcon}
            />
          );
        })}

        {tasks.length === 0 && (
          <div
            className="flex flex-col min-h-[80px] items-center justify-center gap-2 px-3 py-4 text-center border-2 border-dashed border-border/50 rounded-md bg-muted/20 transition-colors hover:bg-muted/30"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              onDragOver(e, column.id, 0);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop(e, column.id, 0);
            }}
          >
            <ClipboardList
              size={24}
              className="text-muted-foreground/60"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {column.tasks.length > 0 ? "No matching tasks" : "No tasks yet"}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                Drag a task here or add a new one
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
