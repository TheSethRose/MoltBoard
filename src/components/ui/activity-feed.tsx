"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  CloudSync,
  Info,
  ArrowUpDown,
  Filter,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

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

type ActivityType = "task_note" | "status_change" | "system";
type ActivityAuthor = "agent" | "system" | "human";

interface FilterState {
  type: Set<ActivityType>;
  author: Set<ActivityAuthor>;
  dateFrom: string;
  dateTo: string;
  sortOrder: "desc" | "asc";
}

const STORAGE_KEY = "activity-feed-filters";

export function ActivityFeed({ projectId, className }: ActivityFeedProps) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(offset);
  const projectIdRef = useRef(projectId);
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            type: new Set(parsed.type || []),
            author: new Set(parsed.author || []),
            dateFrom: parsed.dateFrom || "",
            dateTo: parsed.dateTo || "",
            sortOrder: parsed.sortOrder || "desc",
          };
        }
      } catch {
        // Ignore parse errors
      }
    }
    return {
      type: new Set<ActivityType>(),
      author: new Set<ActivityAuthor>(),
      dateFrom: "",
      dateTo: "",
      sortOrder: "desc",
    };
  });
  const [showFilters, setShowFilters] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const LIMIT = 30;

  // Keep refs in sync
  offsetRef.current = offset;
  projectIdRef.current = projectId;

  // Save filters to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          type: Array.from(filters.type),
          author: Array.from(filters.author),
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          sortOrder: filters.sortOrder,
        }),
      );
    } catch {
      // Ignore storage errors
    }
  }, [filters]);

  const loadActivity = useCallback(
    async (reset = false) => {
      try {
        setLoading(true);
        const newOffset = reset ? 0 : offsetRef.current;
        const currentProjectId = projectIdRef.current;

        // Build query params
        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(newOffset),
          sortOrder: filters.sortOrder,
        });

        if (filters.type.size > 0) {
          filters.type.forEach((type) => params.append("type", type));
        }
        if (filters.author.size > 0) {
          filters.author.forEach((author) => params.append("author", author));
        }
        if (filters.dateFrom) {
          params.set("dateFrom", filters.dateFrom);
        }
        if (filters.dateTo) {
          params.set("dateTo", filters.dateTo);
        }

        const res = await fetch(
          `/api/projects/${currentProjectId}/activity?${params.toString()}`,
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
        setError(
          err instanceof Error ? err.message : "Failed to load activity",
        );
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  const handleDeleteNote = useCallback(
    async (entry: ActivityEntry) => {
      if (!entry.task_id || !entry.id) return;

      try {
        setDeletingNoteId(entry.id);
        const params = new URLSearchParams({
          task_id: String(entry.task_id),
          note_id: entry.id.replace("task-note-", ""),
        });

        const res = await fetch(`/api/tasks/notes?${params.toString()}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Failed to delete note");
        }

        // Reload activity to reflect the deletion
        loadActivity(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete note",
        );
      } finally {
        setDeletingNoteId(null);
      }
    },
    [loadActivity],
  );

  // Reload when filters change
  useEffect(() => {
    loadActivity(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.type.size,
    filters.author.size,
    filters.dateFrom,
    filters.dateTo,
    filters.sortOrder,
  ]);

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

  const getTypeColor = (type: ActivityEntry["type"]) => {
    switch (type) {
      case "task_note":
        return "bg-blue-500/20 text-blue-400";
      case "status_change":
        return "bg-purple-500/20 text-purple-400";
      case "system":
        return "bg-amber-500/20 text-amber-400";
    }
  };

  const toggleType = (type: ActivityType) => {
    setFilters((prev) => {
      const newType = new Set(prev.type);
      if (newType.has(type)) {
        newType.delete(type);
      } else {
        newType.add(type);
      }
      return { ...prev, type: newType };
    });
  };

  const toggleAuthor = (author: ActivityAuthor) => {
    setFilters((prev) => {
      const newAuthor = new Set(prev.author);
      if (newAuthor.has(author)) {
        newAuthor.delete(author);
      } else {
        newAuthor.add(author);
      }
      return { ...prev, author: newAuthor };
    });
  };

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      type: new Set<ActivityType>(),
      author: new Set<ActivityAuthor>(),
      dateFrom: "",
      dateTo: "",
    }));
  };

  const hasActiveFilters =
    filters.type.size > 0 ||
    filters.author.size > 0 ||
    filters.dateFrom ||
    filters.dateTo;

  const activeFilterCount =
    filters.type.size +
    filters.author.size +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  const getTaskLabel = (entry: ActivityEntry) => {
    if (!entry.task_title || !entry.task_number || !entry.task_id) return null;
    return (
      <Link
        href={`/tasks?id=${entry.task_id}`}
        className="text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {`“${entry.task_title}”`} (Task #{entry.task_number})
      </Link>
    );
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Clock size={14} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium shrink-0">Activity</span>
          <span
            className="text-xs text-muted-foreground shrink-0"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            ({activity.length})
          </span>
          {hasActiveFilters && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">
              {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                aria-label="Sort options"
              >
                <ArrowUpDown size={14} className="mr-1" />
                {filters.sortOrder === "desc" ? "Newest" : "Oldest"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuCheckboxItem
                checked={filters.sortOrder === "desc"}
                onCheckedChange={() =>
                  setFilters((prev) => ({
                    ...prev,
                    sortOrder: "desc",
                  }))
                }
              >
                Newest first
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.sortOrder === "asc"}
                onCheckedChange={() =>
                  setFilters((prev) => ({
                    ...prev,
                    sortOrder: "asc",
                  }))
                }
              >
                Oldest first
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter dropdown */}
          <DropdownMenu open={showFilters} onOpenChange={setShowFilters}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={hasActiveFilters ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                aria-label="Filter options"
              >
                <Filter
                  size={14}
                  className={cn("mr-1", hasActiveFilters && "text-primary")}
                />
                Filter
                {hasActiveFilters && (
                  <span className="ml-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 p-3 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Type filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Type
                </label>
                <div className="flex flex-wrap gap-1">
                  {(
                    ["task_note", "status_change", "system"] as ActivityType[]
                  ).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleType(type)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-md border transition-colors",
                        filters.type.has(type)
                          ? "bg-primary/20 border-primary/40 text-primary"
                          : "bg-transparent border-border hover:bg-accent",
                      )}
                    >
                      {getTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Author filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Author
                </label>
                <div className="flex flex-wrap gap-1">
                  {(["agent", "system", "human"] as ActivityAuthor[]).map(
                    (author) => (
                      <button
                        key={author}
                        type="button"
                        onClick={() => toggleAuthor(author)}
                        className={cn(
                          "px-2 py-1 text-xs rounded-md border transition-colors capitalize",
                          filters.author.has(author)
                            ? "bg-primary/20 border-primary/40 text-primary"
                            : "bg-transparent border-border hover:bg-accent",
                        )}
                      >
                        {author === "human"
                          ? "You"
                          : author.charAt(0).toUpperCase() + author.slice(1)}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Date range filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Date range
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">
                      From
                    </label>
                    <Input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          dateFrom: e.target.value,
                        }))
                      }
                      className="h-7 text-xs py-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">
                      To
                    </label>
                    <Input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          dateTo: e.target.value,
                        }))
                      }
                      className="h-7 text-xs py-1"
                    />
                  </div>
                </div>
              </div>

              {/* Clear filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                >
                  <X size={12} />
                  Clear all filters
                </button>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => loadActivity(true)}
            disabled={loading}
            className="p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Refresh activity"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          </button>
        </div>
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
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        getTypeColor(entry.type),
                      )}
                    >
                      {getTypeLabel(entry.type)}
                    </span>
                    {entry.task_title && entry.task_number && entry.task_id && (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                    {getTaskLabel(entry)}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {entry.content}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(entry.timestamp)}
                    </p>
                    {/* Delete button for task notes */}
                    {entry.type === "task_note" && entry.author === "human" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(entry)}
                        disabled={deletingNoteId === entry.id}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Delete this comment"
                      >
                        {deletingNoteId === entry.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Delete
                      </button>
                    )}
                  </div>
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
