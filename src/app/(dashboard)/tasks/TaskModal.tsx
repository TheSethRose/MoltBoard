"use client";

import * as React from "react";
import { useState } from "react";
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
import {
  ResearchButton,
  type TaskFormResponse,
} from "@/components/ui/research-button";
import { generateNoteReview } from "@/lib/clawdbot-research";
import {
  type Task,
  type Project,
  TAG_OPTIONS,
  TAG_COLORS,
  PRIORITY_OPTIONS,
  PRIORITY_COLORS,
  type WorkNote,
} from "./types";

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
  const PRIORITY_ICONS: Record<string, React.ReactNode> = {
    urgent: <AlertCircle size={14} />,
    high: <ArrowUp size={14} />,
    medium: <Minus size={14} />,
    low: <ArrowDown size={14} />,
  };

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
            {PRIORITY_ICONS[option.value]}
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

interface TaskModalProps {
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
}

export function TaskModal({
  open,
  onOpenChange,
  task,
  defaultStatus,
  allTasks,
  projects,
  defaultProjectId,
  onSave,
  onDelete,
}: TaskModalProps) {
  const isEditMode = task !== null;
  const lastTaskIdRef = React.useRef<number | null>(null);
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
    if (!open) return;

    const currentTaskId = task?.id ?? null;
    const taskChanged = currentTaskId !== lastTaskIdRef.current;

    if (taskChanged) {
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

      lastTaskIdRef.current = currentTaskId;
      setShowDeleteConfirm(false);
      setTitleError(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, task, defaultStatus, defaultProjectId]);

  React.useEffect(() => {
    if (!open || !task) return;
    setWorkNotes(task.work_notes || []);
  }, [open, task]);

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
  const handleAddNote = async (
    content: string,
    options?: { author?: WorkNote["author"]; skipAI?: boolean },
  ) => {

    const author = options?.author ?? "human";

    const newNote = {
      id: crypto.randomUUID(),
      content,
      author,
      timestamp: new Date().toISOString(),
    };

    // Optimistic update
    const baseNotes = (task?.work_notes || workNotes || []) as WorkNote[];
    const updatedNotes = [...baseNotes, newNote];
    const updatedTask = task ? { ...task, work_notes: updatedNotes } : null;
    setWorkNotes(updatedNotes);

    // Update local state
    if (task && updatedTask) {
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
    }

    // Also call API to append the note
    if (task) {
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
    }

    const shouldReview = author === "human" && !options?.skipAI;
    if (!shouldReview) return;

    try {
      const context = buildNoteReviewContext(updatedNotes);
      const review = await generateNoteReview(content, context);
      const reply = review.reply?.trim();
      if (!reply) return;

      const agentNote = {
        id: crypto.randomUUID(),
        content: reply,
        author: "agent" as const,
        timestamp: new Date().toISOString(),
      };

      setWorkNotes((prev) => [...(prev || []), agentNote]);

      if (task) {
        await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: task.id,
            work_notes: agentNote,
            append_work_note: true,
          }),
        });
      }
    } catch (err) {
      console.error("Failed to generate AI note review:", err);
    }
  };

  const buildResearchInput = () => {
    const projectName = projectId
      ? projects.find((project) => project.id === projectId)?.name
      : null;
    const statusLabel = status ? formatStatusLabel(status) : "unknown";
    const priorityLabel = priority || "none";
    const tagsLabel = tags.length > 0 ? tags.join(", ") : "none";
    const blockedByLabel =
      blockedBy.length > 0
        ? blockedBy.map((id) => `#${id}`).join(", ")
        : "none";
    const activityLog = (workNotes || [])
      .slice(-5)
      .map((note) => {
        const author = note?.author || "system";
        const timestamp = note?.timestamp || "";
        const content = note?.content || "";
        return `- [${author}] ${timestamp} ${content}`.trim();
      })
      .join("\n");

    return [
      `Title: ${text || "(empty)"}`,
      `Description: ${notes || "(empty)"}`,
      `Status: ${statusLabel}`,
      `Project: ${projectName || "none"}`,
      `Priority: ${priorityLabel}`,
      `Tags: ${tagsLabel}`,
      `Blocked By: ${blockedByLabel}`,
      `Activity Log (read-only context; do not include in output):`,
      activityLog || "(none)",
    ].join("\n");
  };

  const buildNoteReviewContext = (notesOverride?: Task["work_notes"]) => {
    const projectName = projectId
      ? projects.find((project) => project.id === projectId)?.name
      : null;
    const statusLabel = status ? formatStatusLabel(status) : "unknown";
    const priorityLabel = priority || "none";
    const tagsLabel = tags.length > 0 ? tags.join(", ") : "none";
    const blockedByLabel =
      blockedBy.length > 0
        ? blockedBy.map((id) => `#${id}`).join(", ")
        : "none";
    const activityLog = (notesOverride || workNotes || [])
      .slice(-10)
      .map((note) => {
        const author = note?.author || "system";
        const timestamp = note?.timestamp || "";
        const content = note?.content || "";
        return `- [${author}] ${timestamp} ${content}`.trim();
      })
      .join("\n");

    return [
      `Title: ${text || "(empty)"}`,
      `Description: ${notes || "(empty)"}`,
      `Status: ${statusLabel}`,
      `Project: ${projectName || "none"}`,
      `Priority: ${priorityLabel}`,
      `Tags: ${tagsLabel}`,
      `Blocked By: ${blockedByLabel}`,
      `Activity Log (read-only context):`,
      activityLog || "(none)",
    ].join("\n");
  };

  // Handle research assistant completion - auto-fill form fields
  const handleResearchComplete = (data: TaskFormResponse) => {
    const findProjectMatch = (input: string) => {
      if (!input) return null;
      const normalizedInput = input.toLowerCase();
      return (
        projects.find((project) =>
          normalizedInput.includes(project.name.toLowerCase()),
        ) || null
      );
    };
    const formatList = (items: string[] | string, prefix = "- ") => {
      if (!items) return "";
      if (Array.isArray(items)) {
        return items.length > 0
          ? items.map((item) => `${prefix}${item}`).join("\n")
          : "";
      }
      return items ? items : "";
    };
    const acceptance = Array.isArray(data.acceptanceCriteria)
      ? data.acceptanceCriteria
      : [];
    const acceptanceText = acceptance.length
      ? acceptance.map((item) => `- [ ] ${item}`).join("\n")
      : "";
    const scopeText = Array.isArray(data.scope)
      ? data.scope.map((item) => `- ${item}`).join("\n")
      : data.scope || "";
    const dependenciesText = formatList(data.dependencies);
    const outOfScopeText = formatList(data.outOfScope);
    const scopeTextRaw = Array.isArray(data.scope)
      ? data.scope.join("\n")
      : data.scope || "";
    const projectContext = [
      text,
      notes,
      data.title,
      data.goal,
      scopeTextRaw,
      dependenciesText,
      outOfScopeText,
    ]
      .filter(Boolean)
      .join("\n");

    const matchedProject = findProjectMatch(projectContext);
    if (matchedProject) {
      setProjectId(matchedProject.id);
    }

    // Set the generated fields
    setText(data.title);
    setNotes(
      [
        data.goal ? `## Description\n${data.goal}` : "",
        scopeText ? `## Plan\n${scopeText}` : "",
        acceptanceText ? `## Acceptance Criteria\n${acceptanceText}` : "",
        dependenciesText ? `## Dependencies\n${dependenciesText}` : "",
        outOfScopeText ? `## Out of Scope\n${outOfScopeText}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    // Set priority
    setPriority(data.priority);

    // Set tags
    setTags(data.tags);

    // Map dependency task numbers to blockers when possible
    if (Array.isArray(data.dependencies) && data.dependencies.length > 0) {
      const taskNumbers = new Set<number>();
      for (const dep of data.dependencies) {
        const matches = dep.match(/#?(\d+)/g) || [];
        for (const match of matches) {
          const num = parseInt(match.replace("#", ""), 10);
          if (!Number.isNaN(num)) {
            taskNumbers.add(num);
          }
        }
      }

      if (taskNumbers.size > 0) {
        const availableTaskNumbers = new Set(
          allTasks.map((taskItem) => taskItem.task_number),
        );
        const mappedBlockers = Array.from(taskNumbers).filter((num) =>
          availableTaskNumbers.has(num),
        );
        if (mappedBlockers.length > 0) {
          setBlockedBy(mappedBlockers);
        }
      }
    }

    // Focus the title input to let user review
    setTimeout(() => inputRef.current?.focus(), 100);
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
                <ResearchButton
                  mode="task-form"
                  input={buildResearchInput()}
                  onTaskFormComplete={handleResearchComplete}
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                />
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
              notes={workNotes || []}
              onAddNote={(content) => handleAddNote(content)}
              taskId={task?.id}
              taskNumber={task?.task_number}
              disabled={false}
              className="flex-1 h-full min-h-0"
              enableClosureSummary={isEditMode && status === "completed"}
              taskTitle={task?.text || ""}
              onClosureSummarySave={async (content) => {
                await handleAddNote(content, {
                  author: "system",
                  skipAI: true,
                });
              }}
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
