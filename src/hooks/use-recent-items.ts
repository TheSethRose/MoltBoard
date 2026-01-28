"use client";

import { useState, useEffect, useCallback } from "react";

const RECENT_ITEMS_KEY = "moltboard-recent-items";
const MAX_RECENT_ITEMS = 10;

export interface RecentItem {
  id: number;
  type: "task" | "project";
  name: string;
  projectName?: string;
  openedAt: number;
}

interface UseRecentItemsReturn {
  recentItems: RecentItem[];
  addRecentItem: (item: Omit<RecentItem, "openedAt">) => void;
  clearRecentItems: () => void;
  removeRecentItem: (id: number, type: "task" | "project") => void;
}

export function useRecentItems(): UseRecentItemsReturn {
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_ITEMS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentItems(parsed as RecentItem[]);
        }
      }
    } catch (error) {
      console.error("Failed to load recent items:", error);
    }
  }, []);

  // Save to localStorage whenever recentItems changes
  const saveToStorage = useCallback((items: RecentItem[]) => {
    try {
      localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to save recent items:", error);
    }
  }, []);

  const addRecentItem = useCallback(
    (item: Omit<RecentItem, "openedAt">) => {
      setRecentItems((prev) => {
        // Remove existing item with same id and type
        const filtered = prev.filter(
          (i) => !(i.id === item.id && i.type === item.type),
        );

        // Add new item at the beginning
        const newItem: RecentItem = {
          ...item,
          openedAt: Date.now(),
        };
        const updated = [newItem, ...filtered];

        // Limit to MAX_RECENT_ITEMS
        const trimmed = updated.slice(0, MAX_RECENT_ITEMS);

        saveToStorage(trimmed);
        return trimmed;
      });
    },
    [saveToStorage],
  );

  const removeRecentItem = useCallback(
    (id: number, type: "task" | "project") => {
      setRecentItems((prev) => {
        const filtered = prev.filter((i) => !(i.id === id && i.type === type));
        saveToStorage(filtered);
        return filtered;
      });
    },
    [saveToStorage],
  );

  const clearRecentItems = useCallback(() => {
    setRecentItems([]);
    try {
      localStorage.removeItem(RECENT_ITEMS_KEY);
    } catch (error) {
      console.error("Failed to clear recent items:", error);
    }
  }, [saveToStorage]);

  return {
    recentItems,
    addRecentItem,
    clearRecentItems,
    removeRecentItem,
  };
}
