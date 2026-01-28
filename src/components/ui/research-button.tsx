/**
 * Research Assistant Button Component
 * 
 * Provides AI-powered assistance for task creation and completion.
 * Supports two modes:
 * 1. Task Form Auto-fill: Generates structured task fields from natural language
 * 2. Closure Summary: Generates a summary for completed tasks
 */

"use client";

import * as React from "react";
import { Loader2, Sparkles, ClipboardCopy, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TaskFormResponse, ClosureSummaryResponse } from "@/lib/clawdbot-research";

export type ResearchMode = "task-form" | "closure-summary";

export type { TaskFormResponse, ClosureSummaryResponse };

export interface ResearchButtonProps {
  /** The mode of research assistance */
  mode: ResearchMode;
  /** The input text (task description or title) */
  input: string;
  /** For closure summary: optional notes/history */
  notes?: string;
  /** Callback when research completes with task form data */
  onTaskFormComplete?: (data: TaskFormResponse) => void;
  /** Callback when research completes with closure summary data */
  onClosureComplete?: (data: ClosureSummaryResponse) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Optional class name */
  className?: string;
  /** Button variant */
  variant?: "default" | "outline" | "ghost";
  /** Button size */
  size?: "sm" | "default" | "lg";
  /** Button text override */
  children?: React.ReactNode;
}

export function ResearchButton({
  mode,
  input,
  notes,
  onTaskFormComplete,
  onClosureComplete,
  onError,
  className,
  variant = "outline",
  size = "sm",
  children,
}: ResearchButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleResearch = async () => {
    if (!input.trim()) {
      toast.error("Please enter some text first");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading(
      mode === "task-form" ? "Generating task fields..." : "Generating closure summary..."
    );

    try {
      const response = await fetch("/api/clawdbot/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: mode,
          input: input.trim(),
          notes: notes?.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(error.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      toast.dismiss(toastId);

      if (mode === "task-form") {
        toast.success("Task fields generated!");
        onTaskFormComplete?.(data.response);
      } else {
        toast.success("Closure summary generated!");
        onClosureComplete?.(data.response);
      }
    } catch (error) {
      toast.dismiss(toastId);
      const err = error instanceof Error ? error : new Error("Unknown error");
      toast.error(err.message);
      onError?.(err);
    } finally {
      setIsLoading(false);
    }
  };

  const defaultText = mode === "task-form" ? "Moltbot Assist" : "Generate Summary";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleResearch}
      disabled={isLoading || !input.trim()}
      className={cn("gap-1.5", className)}
    >
      {isLoading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Sparkles size={14} />
      )}
      {children || defaultText}
    </Button>
  );
}

/**
 * Closure Summary Result Component
 * Displays the generated closure summary with copy and save actions
 */
export interface ClosureSummaryResultProps {
  /** The closure summary data */
  data: ClosureSummaryResponse;
  /** Callback to save the summary to activity log */
  onSave?: (summary: ClosureSummaryResponse) => void;
  /** Callback to copy the summary to clipboard */
  onCopy?: (summary: ClosureSummaryResponse) => void;
  /** Optional class name */
  className?: string;
}

export function ClosureSummaryResult({
  data,
  onSave,
  onCopy,
  className,
}: ClosureSummaryResultProps) {
  const [hasCopied, setHasCopied] = React.useState(false);

  const handleCopy = async () => {
    const text = formatSummaryForCopy(data);
    await navigator.clipboard.writeText(text);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
    onCopy?.(data);
  };

  const handleSave = () => {
    onSave?.(data);
  };

  return (
    <div className={cn("space-y-4 p-4 bg-muted/30 rounded-lg border", className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          Closure Summary
        </h4>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 gap-1"
          >
            <ClipboardCopy size={12} />
            {hasCopied ? "Copied!" : "Copy"}
          </Button>
          {onSave && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSave}
              className="h-7 px-2 gap-1"
            >
              <Save size={12} />
              Save to Log
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider mb-1">
            Summary
          </p>
          <p className="text-foreground">{data.summary}</p>
        </div>

        {data.keyChanges.length > 0 && (
          <div>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider mb-1">
              Key Changes
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground">
              {data.keyChanges.map((change: string, i: number) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </div>
        )}

        {data.notesForRecord && (
          <div>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider mb-1">
              Notes
            </p>
            <p className="text-foreground">{data.notesForRecord}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Format closure summary for clipboard copy
 */
function formatSummaryForCopy(data: ClosureSummaryResponse): string {
  let text = `## Task Closure Summary\n\n`;
  text += `${data.summary}\n\n`;

  if (data.keyChanges.length > 0) {
    text += `### Key Changes\n`;
    data.keyChanges.forEach((change) => {
      text += `- ${change}\n`;
    });
    text += "\n";
  }

  if (data.notesForRecord) {
    text += `### Notes\n${data.notesForRecord}\n`;
  }

  return text;
}
