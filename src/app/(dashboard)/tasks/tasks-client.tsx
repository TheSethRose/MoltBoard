"use client";

import * as React from "react";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { WorkNotes } from "@/components/ui/work-notes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  AlertCircle,
  ArrowUp,
  Minus,
  ArrowDown,
  FolderOpen,
  ChevronDown,
  AlignLeft,
  CircleDot,
  Link2,
  Tag,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTaskStatuses,
  getDefaultTaskStatus,
  formatStatusLabel,
} from "@/lib/task-statuses";
import type { TaskStatus } from "@/types/task";
import useSWR, { type SWRConfiguration } from "swr";

interface Task {
  id: number;
  task_number: number;
  status: TaskStatus;
  text: string;
  notes?: string;
  tags?: string[];
  priority?: "urgent" | "high" | "medium" | "low" | null;
  order?: number;
  blocked_by?: number[]; // Array of task_numbers this task depends on
  project_id?: number | null;
  work_notes?: {
    id: string;
    content: string;
    author: "agent" | "system" | "human";
    timestamp: string;
  }[];
}

interface Project {
  id: number;
  name: string;
}

const TAG_OPTIONS = [
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
const TAG_COLORS: Record<string, string> = {
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

const PRIORITY_OPTIONS: {
  value: "urgent" | "high" | "medium" | "low";
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "urgent", label: "Urgent", icon: <AlertCircle size={14} /> },
  { value: "high", label: "High", icon: <ArrowUp size={14} /> },
  { value: "medium", label: "Medium", icon: <Minus size={14} /> },
  { value: "low", label: "Low", icon: <ArrowDown size={14} /> },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-emerald-500",
};

const TASK_STATUSES = getTaskStatuses();
const DEFAULT_TASK_STATUS = getDefaultTaskStatus(TASK_STATUSES);

function TagSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const toggleTag = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags">
      {TAG_OPTIONS.map((tag) => {
        const isSelected = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={cn(
              "px-3 py-2 min-h-[44px] md:min-h-[32px] md:py-1 text-xs rounded border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-action-manipulation",
              isSelected
                ? TAG_COLORS[tag] + " border-current"
                : "bg-transparent text-muted-foreground border-border hover:bg-accent",
            )}
            aria-pressed={isSelected}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

function PrioritySelector({
  selected,
  onChange,
}: {
  selected: "urgent" | "high" | "medium" | "low" | undefined | null;
  onChange: (
    priority: "urgent" | "high" | "medium" | "low" | undefined,
  ) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="Priority"
    >
      {PRIORITY_OPTIONS.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(isSelected ? undefined : option.value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-[32px] md:py-1 text-xs rounded border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-action-manipulation",
              isSelected
                ? PRIORITY_COLORS[option.value] +
                    " border-current bg-background/50"
                : "bg-transparent text-muted-foreground border-border hover:bg-accent",
            )}
            aria-pressed={isSelected}
            aria-label={option.label}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function BlockedBySelector({
  selected,
  onChange,
  availableTasks,
  currentTaskNumber,
}: {
  selected: number[];
  onChange: (blockedBy: number[]) => void;
  availableTasks: Task[];
  currentTaskNumber?: number;
}) {
  const [inputValue, setInputValue] = useState("");

  // Filter out current task, completed tasks, and already selected tasks
  const filteredTasks = availableTasks.filter(
    (t) =>
      t.task_number !== currentTaskNumber &&
      t.status !== "completed" &&
      !selected.includes(t.task_number),
  );

  const addBlocker = (taskNumber: number) => {
    if (!selected.includes(taskNumber)) {
      onChange([...selected, taskNumber]);
    }
    setInputValue("");
  };

  const removeBlocker = (taskNumber: number) => {
    onChange(selected.filter((n) => n !== taskNumber));
  };

  const matchingTasks = inputValue.trim()
    ? filteredTasks
        .filter(
          (t) =>
            t.task_number.toString().includes(inputValue) ||
            t.text.toLowerCase().includes(inputValue.toLowerCase()),
        )
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-2">
      {/* Selected blockers */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((taskNum) => {
            const task = availableTasks.find((t) => t.task_number === taskNum);
            return (
              <span
                key={taskNum}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-400 border border-orange-500/30"
              >
                #{taskNum}
                {task
                  ? `: ${task.text.substring(0, 20)}${task.text.length > 20 ? "…" : ""}`
                  : ""}
                <button
                  type="button"
                  onClick={() => removeBlocker(taskNum)}
                  className="hover:text-orange-200 ml-1 min-h-[20px] min-w-[20px] flex items-center justify-center touch-action-manipulation"
                  aria-label={`Remove blocker #${taskNum}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Input for adding blockers */}
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search by # or title to add blocker…"
          className="w-full px-3 py-1.5 text-base md:text-sm bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
        />
        {matchingTasks.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
            {matchingTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => addBlocker(task.task_number)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-accent transition-colors min-h-[36px] touch-action-manipulation"
              >
                <span
                  className="text-muted-foreground"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  #{task.task_number}
                </span>{" "}
                <span className="text-foreground">
                  {task.text.substring(0, 40)}
                  {task.text.length > 40 ? "…" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskModal({
  open,
  onOpenChange,
  task,
  defaultStatus,
  allTasks,
  projects,
  defaultProjectId,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null; // null = add mode, Task = edit mode
  defaultStatus: Task["status"];
  allTasks: Task[];
  projects: Project[];
  defaultProjectId?: number;
  onSave: (
    id: number | null,
    text: string,
    status: Task["status"],
    tags: string[],
    priority: Task["priority"],
    notes: string,
    blockedBy: number[],
    projectId: number | null,
  ) => void;
  onDelete?: (id: number) => void;
}) {
  const isEditMode = task !== null;
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Task["status"]>(DEFAULT_TASK_STATUS);
  const [tags, setTags] = useState<string[]>([]);
  const [priority, setPriority] = useState<Task["priority"]>(undefined);
  const [blockedBy, setBlockedBy] = useState<number[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [workNotes, setWorkNotes] = useState<Task["work_notes"]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      if (task) {
        // Edit mode - populate from task
        setText(task.text);
        setNotes(task.notes || "");
        setStatus(task.status);
        setTags(task.tags || []);
        setPriority(task.priority);
        setBlockedBy(task.blocked_by || []);
        setProjectId(task.project_id || null);
        setWorkNotes(task.work_notes || []);
      } else {
        // Add mode - reset to defaults
        setText("");
        setNotes("");
        setStatus(defaultStatus);
        setTags([]);
        setPriority(undefined);
        setBlockedBy([]);
        setProjectId(defaultProjectId ?? null);
        setWorkNotes([]);
      }
      setShowDeleteConfirm(false);
      setTitleError(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, task, defaultStatus, defaultProjectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setTitleError(true);
      inputRef.current?.focus();
      // Reset shake animation after it completes
      setTimeout(() => setTitleError(false), 600);
      return;
    }
    onSave(
      task?.id ?? null,
      text.trim(),
      status,
      tags,
      priority,
      notes,
      blockedBy,
      projectId,
    );
    onOpenChange(false);
  };

  // Handle #ProjectName shortcuts in title input
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setText(value);

    // Clear error when user starts typing
    if (titleError && value.trim()) {
      setTitleError(false);
    }

    // Check for #ProjectName pattern at the end of input
    const projectMatch = value.match(/#(\w+)$/);
    if (projectMatch && projects.length > 0) {
      const searchTerm = projectMatch[1].toLowerCase();
      const matchedProject = projects.find((p) =>
        p.name.toLowerCase().startsWith(searchTerm),
      );
      if (matchedProject) {
        setProjectId(matchedProject.id);
        // Remove the #ProjectName from the text after a short delay
        // to give visual feedback first
      }
    }
  };

  // Handle keyboard shortcut to confirm project and remove #text
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" || e.key === " ") {
      const projectMatch = text.match(/#(\w+)$/);
      if (projectMatch && projectId) {
        e.preventDefault();
        // Remove the #ProjectName part from text
        setText(text.replace(/#\w+$/, "").trim());
      }
    }
  };

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task.id);
      onOpenChange(false);
    }
  };

  // Handle adding a work note
  const handleAddNote = async (content: string) => {
    if (!task) return;

    const newNote = {
      id: crypto.randomUUID(),
      content,
      author: "human" as const,
      timestamp: new Date().toISOString(),
    };

    // Optimistic update
    const updatedNotes = [...(task.work_notes || []), newNote];
    const updatedTask = { ...task, work_notes: updatedNotes };
    setWorkNotes(updatedNotes);

    // Update local state
    onSave(
      task.id,
      updatedTask.text,
      updatedTask.status,
      updatedTask.tags || [],
      updatedTask.priority || undefined,
      updatedTask.notes || "",
      updatedTask.blocked_by || [],
      updatedTask.project_id || null,
    );

    // Also call API to append the note
    try {
      await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          work_notes: newNote,
          append_work_note: true,
        }),
      });
    } catch (err) {
      console.error("Failed to save work note:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[calc(100%-2rem)] sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-card-foreground">
            {isEditMode ? `Edit Task #${task.task_number}` : "Add Task"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEditMode ? "Modify task details" : "Create a new task"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col md:flex-row">
          {/* Left column: Content + Options */}
          <form
            id="task-form"
            onSubmit={handleSubmit}
            className="space-y-6 py-2 pr-0 md:pr-8 md:flex-[3_1_0%] md:min-w-0"
          >
            <div>
              <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <Type size={14} className="text-muted-foreground" />
                Title
              </label>
              <div className={cn(titleError && "animate-shake")}>
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={handleTitleChange}
                  onKeyDown={handleTitleKeyDown}
                  placeholder="Task title…"
                  className={cn(
                    "w-full px-3 py-2 text-base md:text-base font-semibold bg-background border-2 rounded-md text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring touch-action-manipulation transition-colors",
                    titleError
                      ? "border-destructive focus-visible:ring-destructive/50"
                      : "border-border",
                  )}
                  autoFocus
                  aria-invalid={titleError}
                  aria-describedby={titleError ? "title-error" : undefined}
                />
              </div>
              {titleError && (
                <p
                  id="title-error"
                  className="text-xs text-destructive mt-1.5 flex items-center gap-1"
                  role="alert"
                >
                  <AlertCircle size={12} />
                  Please enter a task name
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <AlignLeft size={14} className="text-muted-foreground" />
                Description
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add details…"
                rows={8}
                className="w-full px-3 py-2 text-base md:text-sm bg-muted/30 border border-border rounded-md text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none touch-action-manipulation"
              />
            </div>

            <div className="border-t border-border" />

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-2">
                    <CircleDot size={12} className="text-muted-foreground" />
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as Task["status"])
                    }
                    className="w-full px-3 py-2 text-base md:text-sm bg-background border border-input rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
                    style={{
                      backgroundColor: "var(--background)",
                      color: "var(--foreground)",
                    }}
                    aria-label="Task status"
                  >
                    {TASK_STATUSES.map((statusOption) => (
                      <option key={statusOption} value={statusOption}>
                        {formatStatusLabel(statusOption)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-2">
                    <FolderOpen size={12} className="text-muted-foreground" />
                    Project
                  </label>
                  <div className="relative">
                    <select
                      value={projectId || ""}
                      onChange={(e) =>
                        setProjectId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-full px-3 py-2 pr-8 text-base md:text-sm bg-background border border-input rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation appearance-none cursor-pointer"
                      style={{
                        backgroundColor: "var(--background)",
                        color: "var(--foreground)",
                      }}
                      aria-label="Project"
                    >
                      <option value="">Inbox (No Project)</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-2">
                  <AlertCircle size={12} className="text-muted-foreground" />
                  Priority
                </label>
                <PrioritySelector selected={priority} onChange={setPriority} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                  <Tag size={12} className="text-muted-foreground" />
                  Tags
                </label>
                <TagSelector selected={tags} onChange={setTags} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                  <Link2 size={12} className="text-muted-foreground" />
                  Blocked By
                </label>
                <BlockedBySelector
                  selected={blockedBy}
                  onChange={setBlockedBy}
                  availableTasks={allTasks}
                  currentTaskNumber={task?.task_number}
                />
              </div>
            </div>
          </form>

          {/* Right column: Activity Log */}
          <div className="border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6 flex flex-col min-h-[280px] md:flex-[2_1_0%] md:min-w-0 md:min-h-0">
            <WorkNotes
              notes={isEditMode ? workNotes || [] : []}
              onAddNote={handleAddNote}
              disabled={!isEditMode}
              className="flex-1 h-full min-h-0"
            />
          </div>
        </div>

        <DialogFooter
          className={cn(
            "flex-shrink-0 border-t border-border pt-4 mt-4",
            isEditMode ? "flex justify-between" : "",
          )}
        >
          {isEditMode && onDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="task-form"
              variant="default"
              disabled={!text.trim()}
            >
              {isEditMode ? "Save Changes" : "Add Task"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {isEditMode && (
        <ConfirmationDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Delete Task?"
          description="This action cannot be undone. This will permanently delete the task."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDelete}
          variant="destructive"
        />
      )}
    </Dialog>
  );
}

// Use negative temp IDs to avoid collision with real DB IDs
let tempIdCounter = -1;

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

interface TasksClientProps {
  initialTasks: Task[];
  /** Optional project ID to filter tasks. When set, only shows tasks for this project. */
  projectId?: number;
  /** Whether to hide the project filter dropdown (useful when viewing a specific project) */
  hideProjectFilter?: boolean;
}

export function TasksClient({
  initialTasks,
  projectId,
  hideProjectFilter = false,
}: TasksClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalStatus, setAddModalStatus] =
    useState<Task["status"]>(DEFAULT_TASK_STATUS);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<{
    column: number;
    index: number;
  } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);

  // SWR configuration with fallback data for hydration
  const swrConfig: SWRConfiguration = {
    fallbackData: { tasks: initialTasks },
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
    refreshInterval: 5000,
  };

  // Use SWR for real-time updates after initial hydration
  // When projectId is set, filter tasks on the server side
  const tasksUrl = projectId
    ? `/api/tasks?project_id=${projectId}`
    : "/api/tasks";
  const { data, mutate } = useSWR<{ tasks: Task[] }>(
    tasksUrl,
    fetcher,
    swrConfig,
  );

  // Fetch projects for filter
  const { data: projectsData } = useSWR<{ projects: Project[] }>(
    "/api/projects",
    fetcher,
  );

  // Project filter state - initialize to projectId if provided
  const [projectFilter, setProjectFilter] = useState<number | "all">(
    projectId ?? "all",
  );

  // Force revalidate when tab becomes visible (for cron updates)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        mutate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [mutate]);

  // Sync SWR data into local state when it changes (after initial load)
  useEffect(() => {
    if (data?.tasks) {
      setTasks((prevTasks) => {
        // Merge server tasks with local state, preserving local modifications
        const mergedTasks = data.tasks.map((serverTask: Task) => {
          const localTask = prevTasks.find((t) => t.id === serverTask.id);
          if (localTask && locallyModifiedTasks.current.has(localTask.id)) {
            return localTask;
          }
          return serverTask;
        });

        // Add any new local-only tasks (temporary tasks not yet saved)
        const serverTaskIds = new Set(data.tasks.map((t: Task) => t.id));
        const newLocalTasks = prevTasks.filter(
          (t) => !serverTaskIds.has(t.id) && t.id < 0,
        );

        return [...mergedTasks, ...newLocalTasks];
      });
    }
  }, [data?.tasks]);

  // Filter tasks by project if selected
  const locallyModifiedTasks = useRef<Set<number>>(new Set());

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(
    new Set(),
  );

  const toggleSelectTask = useCallback((taskId: number) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const selectColumnTasks = useCallback(
    (status: Task["status"]) => {
      const columnTaskIds = tasks
        .filter((t) => t.status === status)
        .map((t) => t.id);
      setSelectedTaskIds((prev) => new Set([...prev, ...columnTaskIds]));
    },
    [tasks],
  );

  const deselectColumnTasks = (status: Task["status"]) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      tasks
        .filter((t) => t.status === status)
        .forEach((t) => next.delete(t.id));
      return next;
    });
  };

  // Optimistic add - use negative temp ID, replace with real ID from response
  const addTask = async (
    text: string,
    status: Task["status"],
    tags: string[],
    priority: Task["priority"],
    notes: string = "",
    blockedBy: number[] = [],
    projectId: number | null = null,
  ) => {
    const tempId = tempIdCounter--;
    const tempTaskNumber = tempIdCounter--;
    const optimisticTask: Task = {
      id: tempId,
      task_number: tempTaskNumber,
      text,
      status,
      tags,
      priority,
      notes,
      blocked_by: blockedBy,
      project_id: projectId,
      work_notes: [],
    };

    // Optimistic update
    setTasks((prev) => [...prev, optimisticTask]);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          status,
          tags,
          priority,
          notes,
          blocked_by: blockedBy,
          project_id: projectId,
        }),
      });

      if (!res.ok) throw new Error("Failed to add task");

      const { task: newTask } = await res.json();

      // Replace temp task with real task from DB
      setTasks((prev) =>
        prev.map((t) =>
          t.id === tempId
            ? {
                ...newTask,
                tags: newTask.tags || [],
                blocked_by: newTask.blocked_by || [],
              }
            : t,
        ),
      );

      // Update SWR cache
      mutate();
      toast.success("Task added successfully");
    } catch {
      // Rollback on error
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      toast.error("Failed to add task");
    }
  };

  // Quick add - add to READY with defaults
  const quickAdd = (text: string) => {
    addTask(text, DEFAULT_TASK_STATUS as Task["status"], [], undefined, "", []);
  };

  // Optimistic delete
  const deleteTask = useCallback(
    async (id: number) => {
      const prevTasks = tasks;
      setTasks((prev) => prev.filter((t) => t.id !== id));

      try {
        const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        // Update SWR cache
        mutate();
        toast.success("Task deleted");
      } catch {
        setTasks(prevTasks);
        toast.error("Failed to delete task");
      }
    },
    [tasks, mutate],
  );

  // Show delete confirmation dialog (for kanban board delete)
  const confirmDeleteTask = (id: number) => {
    setTaskToDelete(id);
    setDeleteConfirmOpen(true);
  };

  // Handle confirmed delete from dialog
  const handleConfirmedDelete = () => {
    if (taskToDelete !== null) {
      deleteTask(taskToDelete);
      setTaskToDelete(null);
    }
  };

  // Optimistic move
  const moveTask = useCallback(
    async (
      taskId: number,
      fromStatus: Task["status"],
      toStatus: Task["status"],
    ) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: toStatus } : t)),
      );
      // Mark this task as locally modified so future refreshes preserve this change
      locallyModifiedTasks.current.add(taskId);

      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskId, status: toStatus }),
        });
        if (!res.ok) throw new Error("Failed to move");
        // Clear the local modification flag after successful sync
        locallyModifiedTasks.current.delete(taskId);
        // Update SWR cache
        mutate();
        toast.success("Task updated");
      } catch {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: fromStatus } : t)),
        );
        // Revert the local modification flag on error
        locallyModifiedTasks.current.delete(taskId);
        toast.error("Failed to update task");
      }
    },
    [mutate],
  );

  // Optimistic reorder within column
  const reorderTasks = async (status: Task["status"], taskIds: number[]) => {
    const prevTasks = tasks;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.status !== status) return t;
        const newOrder = taskIds.indexOf(t.id);
        return newOrder !== -1 ? { ...t, order: newOrder * 10 } : t;
      }),
    );

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, taskIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      // Update SWR cache
      mutate();
    } catch {
      setTasks(prevTasks);
      toast.error("Failed to reorder tasks");
    }
  };

  // Optimistic edit
  const saveTask = async (
    id: number,
    text: string,
    status: Task["status"],
    tags: string[],
    priority: Task["priority"],
    notes: string = "",
    blockedBy: number[] = [],
    projectId: number | null = null,
  ) => {
    const prevTask = tasks.find((t) => t.id === id);
    const statusChanged = prevTask && prevTask.status !== status;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              text,
              status,
              tags,
              priority,
              notes,
              blocked_by: blockedBy,
              project_id: projectId,
              work_notes: t.work_notes || [],
            }
          : t,
      ),
    );

    // Mark as locally modified if status changed
    if (statusChanged) {
      locallyModifiedTasks.current.add(id);
    }

    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          text,
          status,
          tags,
          priority,
          notes,
          blocked_by: blockedBy,
          project_id: projectId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      // Clear the local modification flag after successful sync
      locallyModifiedTasks.current.delete(id);
      // Update SWR cache
      mutate();
      toast.success("Task saved");
    } catch {
      if (prevTask) {
        setTasks((prev) => prev.map((t) => (t.id === id ? prevTask : t)));
      }
      locallyModifiedTasks.current.delete(id);
      toast.error("Failed to update task");
    }
  };

  // Unified modal handler for both add and edit
  const handleSaveTask = async (
    id: number | null,
    text: string,
    status: Task["status"],
    tags: string[],
    priority: Task["priority"],
    notes: string,
    blockedBy: number[],
    projectId: number | null,
  ) => {
    if (id === null) {
      // Add mode
      await addTask(text, status, tags, priority, notes, blockedBy, projectId);
    } else {
      // Edit mode
      await saveTask(
        id,
        text,
        status,
        tags,
        priority,
        notes,
        blockedBy,
        projectId,
      );
    }
  };

  const openAddModal = useCallback((status: Task["status"]) => {
    setAddModalStatus(status);
    setEditingTask(null);
    setAddModalOpen(true);
  }, []);

  const openEditModal = useCallback((task: Task) => {
    setEditingTask(task);
    setAddModalOpen(true);
  }, []);

  // Filter tasks by project if selected
  const filteredTasks = useMemo(() => {
    if (projectFilter === "all") return tasks;
    return tasks.filter((t) => t.project_id === projectFilter);
  }, [tasks, projectFilter]);

  const columns = useMemo(
    () =>
      TASK_STATUSES.map((status) => ({
        id: status as Task["status"],
        title: formatStatusLabel(status).toUpperCase(),
        tasks: filteredTasks.filter((t) => t.status === status),
      })),
    [filteredTasks],
  );

  // Get all tasks in a flat array for keyboard navigation
  const getAllTasks = useCallback(() => columns, [columns]);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when modal is open or when typing in an input
      if (addModalOpen) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const columns = getAllTasks();
      const totalColumns = columns.length;
      const current = selectedTaskIndex;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      switch (e.key) {
        case "n":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            openAddModal(DEFAULT_TASK_STATUS as Task["status"]);
          }
          break;

        case "e":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            const task = columns[current.column].tasks[current.index];
            if (task) {
              e.preventDefault();
              openEditModal(task);
            }
          }
          break;

        case "ArrowRight":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            if (e.altKey) {
              // Move task to next column
              const task = columns[current.column].tasks[current.index];
              const nextStatus = TASK_STATUSES[
                current.column + 1
              ] as Task["status"];
              if (task && nextStatus) {
                moveTask(task.id, task.status, nextStatus);
                setSelectedTaskIndex({
                  column: current.column + 1,
                  index: Math.min(
                    current.index,
                    columns[current.column + 1].tasks.length,
                  ),
                });
              }
            } else {
              setSelectedTaskIndex({
                column: current.column + 1,
                index: Math.min(
                  current.index,
                  columns[current.column + 1].tasks.length - 1,
                ),
              });
            }
          }
          break;

        case "ArrowLeft":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            if (e.altKey) {
              // Move task to previous column
              const task = columns[current.column].tasks[current.index];
              const prevStatus = TASK_STATUSES[
                current.column - 1
              ] as Task["status"];
              if (task && prevStatus) {
                moveTask(task.id, task.status, prevStatus);
                setSelectedTaskIndex({
                  column: current.column - 1,
                  index: Math.min(
                    current.index,
                    columns[current.column - 1].tasks.length,
                  ),
                });
              }
            } else {
              setSelectedTaskIndex({
                column: current.column - 1,
                index: Math.min(
                  current.index,
                  columns[current.column - 1].tasks.length - 1,
                ),
              });
            }
          }
          break;

        case "ArrowDown":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            const currentCol = columns[current.column];
            if (current.index < currentCol.tasks.length - 1) {
              setSelectedTaskIndex({ ...current, index: current.index + 1 });
            } else if (current.column < totalColumns - 1) {
              setSelectedTaskIndex({ column: current.column + 1, index: 0 });
            }
          }
          break;

        case "ArrowUp":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            if (current.index > 0) {
              setSelectedTaskIndex({ ...current, index: current.index - 1 });
            } else if (current.column > 0) {
              const prevCol = columns[current.column - 1];
              setSelectedTaskIndex({
                column: current.column - 1,
                index: prevCol.tasks.length - 1,
              });
            }
          }
          break;

        case "Home":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            setSelectedTaskIndex({ column: 0, index: 0 });
          }
          break;

        case "End":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            setSelectedTaskIndex({
              column: totalColumns - 1,
              index: columns[totalColumns - 1].tasks.length - 1,
            });
          }
          break;

        case "Delete":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            const task = columns[current.column].tasks[current.index];
            if (task) {
              e.preventDefault();
              setTaskToDelete(task.id);
              setDeleteConfirmOpen(true);
            }
          }
          break;

        case "d":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            const task = columns[current.column].tasks[current.index];
            if (task) {
              e.preventDefault();
              deleteTask(task.id);
            }
          }
          break;

        case "Escape":
          if (current) {
            e.preventDefault();
            setSelectedTaskIndex(null);
          }
          break;

        case "h":
          e.preventDefault();
          if (current) {
            const prevCol = current.column - 1;
            if (prevCol >= 0) {
              const col = columns[prevCol];
              if (col.tasks.length > 0) {
                const newIndex = Math.min(current.index, col.tasks.length - 1);
                setSelectedTaskIndex({
                  column: prevCol,
                  index: newIndex >= 0 ? newIndex : 0,
                });
              }
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addModalOpen,
    selectedTaskIndex,
    tasks,
    deleteTask,
    getAllTasks,
    moveTask,
    openAddModal,
    openEditModal,
    toggleSelectTask,
    selectColumnTasks,
  ]);

  return (
    <div className="h-full flex flex-col">
      <KanbanBoard
        columns={columns}
        projects={hideProjectFilter ? undefined : projectsData?.projects}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        onTaskMove={moveTask}
        onTaskReorder={reorderTasks}
        onTaskDelete={confirmDeleteTask}
        onDeleteDirect={(id) => deleteTask(id)}
        onTaskEdit={openEditModal}
        onAddClick={openAddModal}
        onQuickAdd={quickAdd}
        selectedTaskId={
          selectedTaskIndex
            ? columns[selectedTaskIndex.column].tasks[selectedTaskIndex.index]
                ?.id
            : null
        }
        onTaskSelect={(taskId) => {
          const cols = getAllTasks();
          for (let c = 0; c < cols.length; c++) {
            const idx = cols[c].tasks.findIndex((t) => t.id === taskId);
            if (idx !== -1) {
              setSelectedTaskIndex({ column: c, index: idx });
              break;
            }
          }
        }}
        selectedTaskIds={selectedTaskIds}
        onTaskToggleSelect={toggleSelectTask}
        onSelectColumn={selectColumnTasks}
        onDeselectColumn={deselectColumnTasks}
        onBulkMove={async (toStatus) => {
          for (const taskId of selectedTaskIds) {
            const task = tasks.find((t) => t.id === taskId);
            if (task) {
              await moveTask(taskId, task.status, toStatus);
            }
          }
          setSelectedTaskIds(new Set());
        }}
        onBulkDelete={async () => {
          const idsToDelete = Array.from(selectedTaskIds);
          for (const taskId of idsToDelete) {
            await deleteTask(taskId);
          }
          setSelectedTaskIds(new Set());
        }}
        className="flex-1 min-h-0 flex flex-col"
      />

      <TaskModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        task={editingTask}
        defaultStatus={addModalStatus}
        allTasks={tasks}
        projects={projectsData?.projects || []}
        defaultProjectId={projectId}
        onSave={handleSaveTask}
        onDelete={deleteTask}
      />

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Task?"
        description="This action cannot be undone. This will permanently delete the task and all its data."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmedDelete}
        variant="destructive"
      />
    </div>
  );
}
