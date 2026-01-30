"use client";

import { useCallback, useSyncExternalStore } from "react";

export interface ArchiveSettings {
  daysOld: number;
  archiveOnly: boolean;
}

const STORAGE_KEY = "moltboard-archive-settings";
const DEFAULT_SETTINGS: ArchiveSettings = {
  daysOld: 30,
  archiveOnly: true,
};

let cachedRaw: string | null = null;
let cachedSettings: ArchiveSettings = DEFAULT_SETTINGS;

function normalizeSettings(
  input: Partial<ArchiveSettings> | null,
): ArchiveSettings {
  if (!input) return DEFAULT_SETTINGS;
  const daysOldRaw = input.daysOld;
  const daysOld =
    typeof daysOldRaw === "number" && Number.isFinite(daysOldRaw)
      ? Math.max(0, Math.floor(daysOldRaw))
      : DEFAULT_SETTINGS.daysOld;
  const archiveOnly =
    typeof input.archiveOnly === "boolean"
      ? input.archiveOnly
      : DEFAULT_SETTINGS.archiveOnly;
  return { daysOld, archiveOnly };
}

function getArchiveSettings(): ArchiveSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSettings;
  cachedRaw = raw;
  if (!raw) {
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
  try {
    cachedSettings = normalizeSettings(JSON.parse(raw));
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
  }
  return cachedSettings;
}

export function useArchiveSettings() {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  }, []);

  const getSnapshot = useCallback(() => getArchiveSettings(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_SETTINGS, []);

  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const updateSettings = useCallback((next: Partial<ArchiveSettings>) => {
    const current = getArchiveSettings();
    const merged = normalizeSettings({ ...current, ...next });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  return { settings, updateSettings, resetSettings };
}
