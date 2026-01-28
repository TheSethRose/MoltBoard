"use client";

import { useState, useEffect, useRef } from "react";
import {
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  CloudSync,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  type: "task_note" | "status_change" | "system";
  task_id: number | null;
  task_number: number | null;
  task_title: string | null;
  content: string;
  author: "agent" | "system" | "human";
  timestamp: string;
  project_id: number;
}

interface ActivityFeedProps {
  projectId: number;
  className?: string;
}

export function ActivityFeed({ projectId, className }: ActivityFeedProps) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(offset);
  const projectIdRef = useRef(projectId);

  const LIMIT = 30;

  // Keep refs in sync
  offsetRef.current = offset;
  projectIdRef.current = projectId;

  const loadActivity = async (reset = false) => {
    try {
      setLoading(true);
      const newOffset = reset ? 0 : offsetRef.current;
      const currentProjectId = projectIdRef.current;
      const res = await fetch(
        `/api/projects/${currentProjectId}/activity?limit=${LIMIT}&offset=${newOffset}`,
      );
      if (!res.ok) throw new Error("Failed to fetch activity");
      const data = await res.json();

      if (reset) {
        setActivity(data.activity || []);
      } else {
        setActivity((prev) => [...prev, ...(data.activity || [])]);
      }
      setHasMore(data.pagination?.hasMore || false);
      setOffset(newOffset + LIMIT);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity(true);
  }, []);

  const loadMore = () => {
    if (!loading && hasMore) {
      loadActivity(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getAuthorLabel = (author: ActivityEntry["author"]) => {
    switch (author) {
      case "agent":
        return "Agent";
      case "system":
        return "System";
      case "human":
        return "You";
    }
  };

  const getAuthorColor = (author: ActivityEntry["author"]) => {
    switch (author) {
      case "agent":
        return "text-blue-400";
      case "system":
        return "text-yellow-400";
      case "human":
        return "text-green-400";
    }
  };

  const getTypeIcon = (type: ActivityEntry["type"]) => {
    switch (type) {
      case "task_note":
        return <FileText size={14} className="text-blue-400" />;
      case "status_change":
        return <RefreshCw size={14} className="text-purple-400" />;
      case "system":
        return <CloudSync size={14} className="text-amber-400" />;
    }
  };

  const getTypeLabel = (type: ActivityEntry["type"]) => {
    switch (type) {
      case "task_note":
        return "Note";
      case "status_change":
        return "Status";
      case "system":
        return "System";
    }
  };

  const getTaskLink = (entry: ActivityEntry) => {
    if (entry.task_number) {
      return (
        <a
          href={`/tasks/${entry.task_number}`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          #{entry.task_number}
        </a>
      );
    }
    return null;
  };

  return (
    <div
      className={cn(
        "flex flex-col border border-border rounded-lg bg-card",
        className,
      )}
      role="region"
      aria-label="Project activity feed"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">Activity</span>
          <span
            className="text-xs text-muted-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            ({activity.length})
          </span>
        </div>
        <button
          type="button"
          onClick={() => loadActivity(true)}
          disabled={loading}
          className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
          aria-label="Refresh activity"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 text-xs text-destructive bg-destructive/10">
          {error}
        </div>
      )}

      {/* Activity Feed */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="Activity entries"
      >
        {activity.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <div className="p-3 rounded-full bg-muted/50 mb-3">
              <Info size={24} className="text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              No activity yet
            </p>
            <p className="text-xs text-muted-foreground/70">
              Task changes and sync events will appear here…
            </p>
          </div>
        )}

        {activity.length > 0 && (
          <div className="py-2">
            {activity.map((entry, index) => (
              <div
                key={entry.id}
                className="flex gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                {/* Timeline indicator */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="p-1.5 rounded-full bg-muted/50">
                    {getTypeIcon(entry.type)}
                  </div>
                  {/* Timeline line */}
                  {index < activity.length - 1 && (
                    <div className="w-px flex-1 bg-border/50 mt-2" />
                  )}
                </div>

                {/* Entry content */}
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        getAuthorColor(entry.author),
                      )}
                    >
                      {getAuthorLabel(entry.author)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getTypeLabel(entry.type)}
                    </span>
                    {getTaskLink(entry)}
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {entry.content}
                  </p>
                  {entry.task_title && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Task: {entry.task_title}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="p-3 border-t border-border">
            <button
              type="button"
              onClick={loadMore}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Load more activity
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
