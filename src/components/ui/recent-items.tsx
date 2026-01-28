"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Clock,
  X,
  FileText,
  Folder,
} from "lucide-react";
import { useRecentItems, RecentItem } from "@/hooks/use-recent-items";
import { cn } from "@/lib/utils";

interface RecentItemsProps {
  maxItems?: number;
  className?: string;
}

function RecentItemEntry({
  item,
  onRemove,
}: {
  item: RecentItem;
  onRemove: () => void;
}) {
  const href = item.type === "project" ? `/projects/${item.id}` : `/tasks?id=${item.id}`;

  return (
    <div className="flex items-center gap-2 group">
      <Link
        href={href}
        className="flex-1 flex items-center gap-2 min-w-0 px-2 py-1.5 rounded hover:bg-accent transition-colors"
      >
        {item.type === "project" ? (
          <Folder size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <FileText size={14} className="shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.name}</p>
          {item.projectName && item.type === "task" && (
            <p className="text-xs text-muted-foreground truncate">
              {item.projectName}
            </p>
          )}
        </div>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-opacity"
        aria-label="Remove from recent"
      >
        <X size={12} className="text-muted-foreground" />
      </button>
    </div>
  );
}

export function RecentItems({ maxItems = 5, className }: RecentItemsProps) {
  const { recentItems, clearRecentItems, removeRecentItem } = useRecentItems();

  const displayItems = useMemo(
    () => recentItems.slice(0, maxItems),
    [recentItems, maxItems],
  );

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (recentItems.length === 0) {
    return (
      <div className={cn("px-3 py-2", className)}>
        <p className="text-xs text-muted-foreground text-center">
          No recent items yet
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Clock size={12} />
          <span>Recent</span>
        </div>
        {recentItems.length > 0 && (
          <button
            onClick={clearRecentItems}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div className="space-y-0.5 px-2">
        {displayItems.map((item) => (
          <RecentItemEntry
            key={`${item.type}-${item.id}`}
            item={item}
            onRemove={() => removeRecentItem(item.id, item.type)}
          />
        ))}
      </div>
      {recentItems.length > maxItems && (
        <Link
          href="/tasks"
          className="block px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
        >
          View all ({recentItems.length})
        </Link>
      )}
    </div>
  );
}
