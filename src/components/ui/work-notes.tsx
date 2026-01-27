"use client";

import { useState, useRef, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Send, Bot, User, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkNote {
  id: string;
  content: string;
  author: "agent" | "system" | "human";
  timestamp: string;
}

// Support legacy string arrays and proper WorkNote objects
type RawNote = WorkNote | string;

interface WorkNotesProps {
  notes: RawNote[];
  onAddNote: (content: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
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
    };
  });
}

export function WorkNotes({
  notes: rawNotes,
  onAddNote,
  disabled = false,
  className,
}: WorkNotesProps) {
  const notes = normalizeNotes(rawNotes);
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new notes are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes]);

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
      </div>

      {/* Notes Feed */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto"
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
        <div className="border border-input bg-background rounded-2xl p-2 shadow-xs">
          <TextareaAutosize
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
            disabled={disabled || isSubmitting}
            minRows={2}
            maxRows={6}
            className="w-full resize-none border-none bg-transparent px-2 py-1 text-base md:text-sm text-foreground placeholder:text-muted-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
          />
          <div className="flex items-center justify-end pt-2">
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
