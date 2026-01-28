"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import {
  TAG_COLORS as DEFAULT_TAG_COLORS,
  PRIORITY_COLORS as DEFAULT_PRIORITY_COLORS,
  TAG_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/lib/constants";

const ALL_TAGS = TAG_OPTIONS;

const ALL_PRIORITIES = PRIORITY_OPTIONS.map((p) => p.value);

type BlockedFilter = "all" | "unblocked" | "blocked";

export interface KanbanProject {
  id: number;
  name: string;
}

export interface FilterBarProps {
  tagFilter: string[];
  priorityFilter: string[];
  searchQuery: string;
  blockedFilter: BlockedFilter;
  projects?: KanbanProject[];
  projectFilter: number | "all";
  onTagChange: (tag: string) => void;
  onPriorityChange: (priority: string) => void;
  onSearchChange: (query: string) => void;
  onBlockedChange: (filter: BlockedFilter) => void;
  onProjectChange: (projectId: number | "all") => void;
  onClear: () => void;
  tagColors?: Record<string, string>;
}

export function FilterBar({
  tagFilter,
  priorityFilter,
  searchQuery,
  blockedFilter,
  projects,
  projectFilter,
  onTagChange,
  onPriorityChange,
  onSearchChange,
  onBlockedChange,
  onProjectChange,
  onClear,
  tagColors,
}: FilterBarProps) {
  const hasFilters =
    tagFilter.length > 0 ||
    priorityFilter.length > 0 ||
    searchQuery.length > 0 ||
    blockedFilter !== "all" ||
    projectFilter !== "all";

  return (
    <div className="mb-4 p-3 bg-card/50 border border-border rounded-lg">
      <div className="flex gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 py-1.5 text-base md:text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 min-h-[24px] min-w-[24px] flex items-center justify-center touch-action-manipulation"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {projects && projects.length > 0 && (
          <div className="relative min-w-[180px]">
            <select
              value={projectFilter}
              onChange={(e) =>
                onProjectChange(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="w-full px-3 py-1.5 text-base md:text-sm bg-background border border-border rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer touch-action-manipulation"
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
              }}
            >
              <option value="all">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs text-muted-foreground font-medium">
          Filter:
        </span>

        <div className="flex gap-1">
          <button
            onClick={() =>
              onBlockedChange(
                blockedFilter === "unblocked" ? "all" : "unblocked",
              )
            }
            className={cn(
              "px-2 py-0.5 text-xs rounded border transition-colors",
              blockedFilter === "unblocked"
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-transparent text-muted-foreground border-border hover:bg-accent",
            )}
          >
            Unblocked
          </button>
          <button
            onClick={() =>
              onBlockedChange(blockedFilter === "blocked" ? "all" : "blocked")
            }
            className={cn(
              "px-2 py-0.5 text-xs rounded border transition-colors",
              blockedFilter === "blocked"
                ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                : "bg-transparent text-muted-foreground border-border hover:bg-accent",
            )}
          >
            Blocked
          </button>
        </div>

        <div className="w-px h-4 bg-border" />

        <div className="flex gap-1">
          {ALL_PRIORITIES.map((priority) => {
            const isActive = priorityFilter.includes(priority);
            return (
              <button
                key={priority}
                onClick={() => onPriorityChange(priority)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded border transition-colors",
                  isActive
                    ? DEFAULT_PRIORITY_COLORS[priority] + " border-current"
                    : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                )}
              >
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </button>
            );
          })}
        </div>

        <div className="w-px h-4 bg-border" />

        <div className="flex gap-1 flex-wrap">
          {ALL_TAGS.map((tag) => {
            const isActive = tagFilter.includes(tag);
            const colorClass =
              tagColors?.[tag] ||
              DEFAULT_TAG_COLORS[tag] ||
              DEFAULT_TAG_COLORS.task;
            return (
              <button
                key={tag}
                onClick={() => onTagChange(tag)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded border transition-colors",
                  isActive
                    ? colorClass + " border-current"
                    : "bg-transparent text-muted-foreground border-border hover:bg-accent",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {hasFilters && (
          <button
            onClick={onClear}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
