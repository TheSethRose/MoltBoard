import { randomUUID } from "node:crypto";
import type { WorkNote } from "@/types/task";

export type RawWorkNote = WorkNote | string | null | undefined;

interface NormalizeOptions {
  defaultAuthor?: WorkNote["author"];
  fillTimestamp?: boolean;
}

export function normalizeWorkNote(
  note: RawWorkNote,
  { defaultAuthor = "system", fillTimestamp = false }: NormalizeOptions = {},
): WorkNote {
  if (typeof note === "string") {
    return {
      id: randomUUID(),
      content: note,
      author: defaultAuthor,
      timestamp: fillTimestamp ? new Date().toISOString() : "",
    };
  }

  if (!note || typeof note !== "object") {
    return {
      id: randomUUID(),
      content: "",
      author: defaultAuthor,
      timestamp: fillTimestamp ? new Date().toISOString() : "",
    };
  }

  return {
    id: note.id || randomUUID(),
    content: note.content || "",
    author: note.author || defaultAuthor,
    timestamp:
      note.timestamp || (fillTimestamp ? new Date().toISOString() : ""),
  };
}

export function normalizeWorkNotes(
  notes: RawWorkNote[] | undefined,
  options?: NormalizeOptions,
): WorkNote[] {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => normalizeWorkNote(note, options));
}

export function mergeWorkNotes(
  existing: RawWorkNote[] | undefined,
  incoming: RawWorkNote[] | undefined,
  options?: NormalizeOptions,
): WorkNote[] {
  const existingNotes = normalizeWorkNotes(existing, options);
  const incomingNotes = normalizeWorkNotes(incoming, options);

  const existingIds = new Set(existingNotes.map((note) => note.id));
  const merged = [...existingNotes];

  for (const note of incomingNotes) {
    if (!existingIds.has(note.id)) {
      merged.push(note);
      existingIds.add(note.id);
    }
  }

  return merged;
}

export function appendWorkNote(
  existingNotes: RawWorkNote[] | undefined,
  note: RawWorkNote,
  defaultAuthor: WorkNote["author"] = "system",
): WorkNote[] {
  const normalizedExisting = normalizeWorkNotes(existingNotes, {
    defaultAuthor,
  });
  const normalizedNote = normalizeWorkNote(note, {
    defaultAuthor,
    fillTimestamp: true,
  });
  return [...normalizedExisting, normalizedNote];
}

/**
 * Generate a system work note describing a field change.
 * Returns null if no meaningful change occurred.
 */
export function createFieldChangeNote(
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
): WorkNote | null {
  // Normalize values for comparison
  const normalize = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return JSON.stringify(v);
    return String(v);
  };

  const oldStr = normalize(oldValue);
  const newStr = normalize(newValue);

  // No change
  if (oldStr === newStr) return null;

  // Build concise diff summary
  const timestamp = new Date().toISOString();

  if (!oldStr) {
    // Field was set (previously empty/null)
    return {
      id: crypto.randomUUID(),
      content: `Set ${fieldName}: ${newStr}`,
      author: "system",
      timestamp,
    };
  }

  if (!newStr) {
    // Field was cleared
    return {
      id: crypto.randomUUID(),
      content: `Cleared ${fieldName}`,
      author: "system",
      timestamp,
    };
  }

  // Field was changed
  return {
    id: crypto.randomUUID(),
    content: `Changed ${fieldName}: ${oldStr} → ${newStr}`,
    author: "system",
    timestamp,
  };
}
