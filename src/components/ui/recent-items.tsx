"use client";

import { useMemo } from "react";
import Link from "next/link";
import { X, FileText, Folder } from "lucide-react";
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
  const href =
    item.type === "project" ? `/projects/${item.id}` : `/tasks?id=${item.id}`;

  return (
    <div className="flex items-center gap-2 group">
      <Link
        href={href}
        className="flex-1 flex items-center gap-3 min-w-0 px-3 py-2 min-h-[40px] rounded-md transition-colors touch-action-manipulation text-muted-foreground hover:text-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {item.type === "project" ? (
          <Folder
            size={16}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <FileText
            size={16}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{item.name}</p>
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
        className="opacity-0 group-hover:opacity-100 p-1.5 min-h-[32px] min-w-[32px] rounded hover:bg-accent transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-action-manipulation"
        aria-label="Remove from recent"
      >
        <X size={14} className="text-muted-foreground" aria-hidden="true" />
      </button>
    </div>
  );
}

export function RecentItems({ maxItems = 5, className }: RecentItemsProps) {
  const { recentItems, removeRecentItem } = useRecentItems();

  const displayItems = useMemo(
    () => recentItems.slice(0, maxItems),
    [recentItems, maxItems],
  );

  return (
    <div className={cn("space-y-1", className)}>
      {recentItems.length === 0 ? (
        <div className="px-3 py-2 min-h-[40px] flex items-center justify-center">
          <p className="text-xs text-muted-foreground text-center">
            No recent items yet
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
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
              className="block px-3 py-2 min-h-[40px] rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View all ({recentItems.length})
            </Link>
          )}
        </>
      )}
    </div>
  );
}
