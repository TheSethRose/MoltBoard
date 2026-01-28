"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "./types";
import { DeleteButton } from "../delete-button";

interface TaskCardProps {
  task: KanbanTask;
  config: {
    label: string;
    color: string;
  };
  isDragging?: boolean;
  isOverTarget?: boolean;
  isSelected?: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  getTagColor: (tag: string) => string;
  getPriorityColor: (priority: string) => string;
  getPriorityIcon: (priority: string) => React.ReactNode;
  isCompleted?: boolean;
}

export function TaskCard({
  task,
  config,
  isDragging,
  isOverTarget,
  isSelected,
  onEdit,
  onSelect,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  getTagColor,
  getPriorityColor,
  getPriorityIcon,
  isCompleted,
}: TaskCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.stopPropagation();
        onDrop(e);
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        onEdit();
        onSelect();
      }}
      onDoubleClick={() => {
        onEdit();
        onSelect();
      }}
      onFocus={onSelect}
      className={cn(
        "cursor-grab rounded border border-white/10 bg-card p-2 shadow-sm transition-all duration-150",
        "hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
        isDragging && "rotate-2 opacity-50 z-50",
        isOverTarget && "border-primary border-dashed scale-105",
        isCompleted && "opacity-75",
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
        <DeleteButton onDelete={onDelete} size="sm" />
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {task.tags.map((tag: string) => (
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
          <span>{task.blocked_by.map((n: number) => `#${n}`).join(", ")}</span>
        </div>
      )}
    </div>
  );
}
