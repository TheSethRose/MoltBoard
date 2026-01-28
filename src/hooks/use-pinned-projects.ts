"use client";

import { useSyncExternalStore, useCallback } from "react";

const PINNED_PROJECTS_KEY = "moltboard-pinned-projects";

// Get initial value from localStorage
function getPinnedProjects(): number[] {
  if (typeof window === "undefined") return [];
  const item = localStorage.getItem(PINNED_PROJECTS_KEY);
  return item ? JSON.parse(item) : [];
}

export function usePinnedProjects() {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  }, []);

  const getSnapshot = useCallback(() => {
    return getPinnedProjects();
  }, []);

  const getServerSnapshot = useCallback(() => [], []);

  const pinnedIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const togglePin = useCallback((projectId: number) => {
    const current = getPinnedProjects();
    const isPinned = current.includes(projectId);
    let updated: number[];

    if (isPinned) {
      updated = current.filter((id) => id !== projectId);
    } else {
      updated = [...current, projectId];
    }

    localStorage.setItem(PINNED_PROJECTS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new StorageEvent("storage", { key: PINNED_PROJECTS_KEY }));
  }, []);

  const isPinned = useCallback((projectId: number) => {
    return getPinnedProjects().includes(projectId);
  }, []);

  return {
    pinnedIds,
    togglePin,
    isPinned,
  };
}
