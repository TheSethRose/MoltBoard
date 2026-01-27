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
    timestamp: note.timestamp || (fillTimestamp ? new Date().toISOString() : ""),
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
