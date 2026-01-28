"use client";

import { useSyncExternalStore, useCallback } from "react";

const PINNED_PROJECTS_KEY = "moltboard-pinned-projects";
const EMPTY_PINNED: number[] = [];
let cachedPinnedRaw: string | null = null;
let cachedPinnedProjects: number[] = EMPTY_PINNED;

// Get initial value from localStorage
function getPinnedProjects(): number[] {
  if (typeof window === "undefined") return EMPTY_PINNED;
  const item = localStorage.getItem(PINNED_PROJECTS_KEY);
  if (item === cachedPinnedRaw) return cachedPinnedProjects;
  cachedPinnedRaw = item;
  if (!item) {
    cachedPinnedProjects = EMPTY_PINNED;
    return cachedPinnedProjects;
  }
  try {
    const parsed = JSON.parse(item);
    cachedPinnedProjects = Array.isArray(parsed)
      ? parsed.map((value) => Number(value)).filter((id) => !Number.isNaN(id))
      : EMPTY_PINNED;
  } catch {
    cachedPinnedProjects = EMPTY_PINNED;
  }
  return cachedPinnedProjects;
}

export function usePinnedProjects() {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  }, []);

  const getSnapshot = useCallback(() => {
    return getPinnedProjects();
  }, []);

  const getServerSnapshot = useCallback(() => EMPTY_PINNED, []);

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
