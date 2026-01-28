import { randomUUID } from "node:crypto";

export function normalizeWorkNote(
  note,
  { defaultAuthor = "system", fillTimestamp = false } = {},
) {
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

export function normalizeWorkNotes(notes, options) {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => normalizeWorkNote(note, options));
}

export function parseWorkNotes(workNotesJson, options) {
  try {
    const parsed = JSON.parse(workNotesJson || "[]");
    return normalizeWorkNotes(parsed, options);
  } catch {
    return [];
  }
}

export function appendWorkNote(db, taskId, content, author = "system") {
  const task = db
    .prepare("SELECT work_notes FROM tasks WHERE id = ?")
    .get(taskId);
  const notes = parseWorkNotes(task?.work_notes, { defaultAuthor: author });

  const newNote = {
    id: randomUUID(),
    content,
    author,
    timestamp: new Date().toISOString(),
  };

  notes.push(newNote);
  db.prepare(
    "UPDATE tasks SET work_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(JSON.stringify(notes), taskId);

  return newNote;
}
