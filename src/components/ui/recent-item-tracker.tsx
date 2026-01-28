"use client";

import { useEffect } from "react";
import { useRecentItems } from "@/hooks/use-recent-items";

interface RecentItemTrackerProps {
  id: number;
  name: string;
  type: "task" | "project";
  projectName?: string;
}

export function RecentItemTracker({
  id,
  name,
  type,
  projectName,
}: RecentItemTrackerProps) {
  const { addRecentItem } = useRecentItems();

  useEffect(() => {
    addRecentItem({
      id,
      name,
      type,
      projectName,
    });
  }, [id, name, type, projectName, addRecentItem]);

  return null;
}
