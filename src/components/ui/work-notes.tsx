"use client";

import { useState, useRef, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";
import {
  Send,
  Bot,
  User,
  Clock,
  Loader2,
  Trash2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResearchButton,
  ClosureSummaryResult,
  type ClosureSummaryResponse,
} from "./research-button";

interface WorkNote {
  id: string;
  content: string;
  author: "agent" | "system" | "human";
  timestamp: string;
  deleted?: boolean;
  deleted_by?: "agent" | "system" | "human" | null;
  deleted_at?: string | null;
}

// Support legacy string arrays and proper WorkNote objects
type RawNote = WorkNote | string;

interface WorkNotesProps {
  notes: RawNote[];
  onAddNote: (content: string) => Promise<void>;
  /** Optional: Callback when a note is deleted - parent should update its state */
  onDeleteNote?: (noteId: string) => void;
  taskId?: number;
  taskNumber?: number;
  disabled?: boolean;
  className?: string;
  /** Optional: Enable closure summary for completed tasks */
  enableClosureSummary?: boolean;
  /** Optional: Task title for closure summary generation */
  taskTitle?: string;
  /** Optional: Callback when closure summary is saved */
  onClosureSummarySave?: (summary: string) => Promise<void>;
}

// Normalize notes to ensure they have all required fields
function normalizeNotes(rawNotes: RawNote[]): WorkNote[] {
  return rawNotes.map((note, index) => {
    if (typeof note === "string") {
      // Legacy format: plain string
      return {
        id: `legacy-${index}`,
        content: note,
        author: "system" as const,
        timestamp: "",
      };
    }
    // Ensure all fields exist
    return {
      id: note.id || `note-${index}`,
      content: note.content || "",
      author: note.author || "system",
      timestamp: note.timestamp || "",
      deleted: note.deleted || false,
      deleted_by: note.deleted_by ?? null,
      deleted_at: note.deleted_at ?? null,
    };
  });
}

export function WorkNotes({
  notes: rawNotes,
  onAddNote,
  onDeleteNote,
  taskId,
  taskNumber,
  disabled = false,
  className,
  enableClosureSummary = false,
  taskTitle = "",
  onClosureSummarySave,
}: WorkNotesProps) {
  const notes = normalizeNotes(rawNotes).filter((note) => !note.deleted);
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showClosureSummary, setShowClosureSummary] = useState(false);
  const [closureResult, setClosureResult] =
    useState<ClosureSummaryResponse | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevNotesLengthRef = useRef(notes.length);

  // Auto-scroll to bottom only when new notes are added, not on every render
  useEffect(() => {
    if (notes.length > prevNotesLengthRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevNotesLengthRef.current = notes.length;
  }, [notes.length]);

  const handleSubmit = async () => {
    if (!newNote.trim() || isSubmitting) return;

    const content = newNote.trim();
    setNewNote("");
    setIsSubmitting(true);

    try {
      await onAddNote(content);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClosureComplete = (data: ClosureSummaryResponse) => {
    setClosureResult(data);
  };

  const handleSaveClosureSummary = async () => {
    if (!closureResult || !onClosureSummarySave) return;

    const summaryText = `## Closure Summary\n\n${closureResult.summary}\n\n${
      closureResult.keyChanges.length > 0
        ? `### Key Changes\n${closureResult.keyChanges.map((c: string) => `- ${c}`).join("\n")}\n\n`
        : ""
    }${closureResult.notesForRecord ? `### Notes\n${closureResult.notesForRecord}` : ""}`;

    await onClosureSummarySave(summaryText);
    setShowClosureSummary(false);
  };

  const handleDeleteNote = async (note: WorkNote) => {
    if ((!taskId && !taskNumber) || !note.id) return;
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;

    setDeleteError(null);
    setDeletingNoteId(note.id);

    try {
      const params = new URLSearchParams({
        note_id: note.id,
      });

      if (taskId) {
        params.set("task_id", String(taskId));
      } else if (taskNumber) {
        params.set("task_number", String(taskNumber));
      }

      const res = await fetch(`/api/tasks/notes?${params.toString()}`, {
        method: "DELETE",
        headers: {
          "X-Moltboard-UI": "1",
        },
      });

      if (!res.ok) {
        const error = await res.json();
        console.warn("[WorkNotes] delete note failed", {
          status: res.status,
          error,
          taskId,
          taskNumber,
          noteId: note.id,
        });
        throw new Error(error.message || "Failed to delete note");
      }

      // Notify parent to update its state
      onDeleteNote?.(note.id);
    } catch (err) {
      console.warn("[WorkNotes] delete note error", err);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete note",
      );
    } finally {
      setDeletingNoteId(null);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return timestamp;
    }
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getAuthorIcon = (author: WorkNote["author"]) => {
    switch (author) {
      case "agent":
        return <Bot size={14} className="text-blue-400" />;
      case "system":
        return <Clock size={14} className="text-yellow-400" />;
      case "human":
        return <User size={14} className="text-green-400" />;
    }
  };

  const getAuthorLabel = (author: WorkNote["author"]) => {
    switch (author) {
      case "agent":
        return "Agent";
      case "system":
        return "System";
      case "human":
        return "You";
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col border border-border rounded-lg bg-card",
        className,
      )}
      role="region"
      aria-label="Activity log"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">Activity Log</span>
          <span
            className="text-xs text-muted-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            ({notes.length})
          </span>
        </div>
        {enableClosureSummary && taskTitle && (
          <button
            type="button"
            onClick={() => setShowClosureSummary(!showClosureSummary)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            {showClosureSummary ? (
              <>
                <CheckCircle2 size={12} />
                Hide Summary
              </>
            ) : (
              <>
                <Sparkles size={12} />
                Generate Summary
              </>
            )}
          </button>
        )}
      </div>
      {deleteError && (
        <div className="px-3 py-2 text-xs text-destructive border-b border-border">
          {deleteError}
        </div>
      )}

      {/* Closure Summary Panel */}
      {enableClosureSummary && showClosureSummary && (
        <div className="border-b border-border p-3 bg-muted/20">
          {closureResult ? (
            <ClosureSummaryResult
              data={closureResult}
              onSave={handleSaveClosureSummary}
              onCopy={() => {}}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Generate a closure summary for this completed task.
              </p>
              <ResearchButton
                mode="closure-summary"
                input={taskTitle}
                notes={notes.map((n) => n.content).join("\n\n")}
                onClosureComplete={handleClosureComplete}
                className="w-full justify-center"
              />
            </div>
          )}
        </div>
      )}

      {/* Notes Feed */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Activity log entries"
      >
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <div className="p-3 rounded-full bg-muted/50 mb-3">
              <Clock size={24} className="text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              No activity yet
            </p>
            <p className="text-xs text-muted-foreground/70">
              Add a note to track progress…
            </p>
          </div>
        ) : (
          <div className="py-2">
            {notes.map((note, index) => (
              <div
                key={note.id || `note-${index}`}
                className="flex gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                {/* Timeline indicator and avatar */}
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className={cn(
                      "p-1.5 rounded-full",
                      note.author === "agent" && "bg-blue-500/20",
                      note.author === "system" && "bg-yellow-500/20",
                      note.author === "human" && "bg-green-500/20",
                    )}
                  >
                    {getAuthorIcon(note.author)}
                  </div>
                  {/* Timeline line */}
                  <div className="w-px flex-1 bg-border/50 mt-2" />
                </div>

                {/* Note content */}
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        note.author === "agent" && "text-blue-400",
                        note.author === "system" && "text-yellow-400",
                        note.author === "human" && "text-green-400",
                      )}
                    >
                      {getAuthorLabel(note.author)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(note.timestamp)}
                    </span>
                    {taskId && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note)}
                        disabled={deletingNoteId === note.id}
                        className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Delete this comment"
                      >
                        {deletingNoteId === note.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Note Input */}
      <div className="border-t border-border p-3">
        <label htmlFor="work-note-input" className="sr-only">
          Add a note
        </label>
        <div className="border border-input bg-background rounded-2xl p-2 shadow-xs">
          <TextareaAutosize
            id="work-note-input"
            ref={textareaRef}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Add a note…"
            aria-describedby="work-note-hint"
            disabled={disabled || isSubmitting}
            minRows={2}
            maxRows={6}
            className="w-full resize-none border-none bg-transparent px-2 py-1 text-base md:text-sm text-foreground placeholder:text-muted-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
          />
          <div className="flex items-center justify-between pt-2">
            <span
              id="work-note-hint"
              className="text-xs text-muted-foreground px-2"
            >
              Press {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}
              +Enter to send
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!newNote.trim() || disabled || isSubmitting}
              className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-action-manipulation flex items-center justify-center"
              aria-label="Send note"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
