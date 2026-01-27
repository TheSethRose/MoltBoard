import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import { DbTask, parseDbTask, WorkNote } from "@/types/task";
import { getDefaultTaskStatus, isValidTaskStatus } from "@/lib/task-statuses";
import {
  mergeWorkNotes,
  normalizeWorkNote,
  normalizeWorkNotes,
  type RawWorkNote,
} from "@/lib/work-notes";
import {
  withErrorHandling,
  badRequest,
  notFound,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

const TAG_COLORS: Record<string, string> = {
  bug: "bg-red-500/20 text-red-400 border-red-500/30",
  feature: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  task: "bg-green-500/20 text-green-400 border-green-500/30",
  chore: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  research: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  spike: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  maintenance: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  safety: "bg-red-500/20 text-red-400 border-red-500/30",
  audit: "bg-green-500/20 text-green-400 border-green-500/30",
};

// GET - List all tasks
export const GET = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const { searchParams } = new URL(req.url);
      const projectId = searchParams.get("project_id");

      const db = getDb();

      let query = `SELECT * FROM tasks`;
      const params: (number | string)[] = [];

      if (projectId) {
        query += ` WHERE project_id = ?`;
        params.push(parseInt(projectId, 10));
      }

      query += ` ORDER BY 
          CASE priority 
            WHEN 'urgent' THEN 0 
            WHEN 'high' THEN 1 
            WHEN 'medium' THEN 2 
            WHEN 'low' THEN 3 
            ELSE 4 
          END,
          sort_order ASC,
          id ASC`;

      const rows = db.prepare(query).all(...params) as DbTask[];
      releaseDb(db);

      const tasks = rows.map(parseDbTask);
      return NextResponse.json({ tasks, tagColors: TAG_COLORS });
    } catch (error) {
      logError(error as Error, { route: "/api/tasks", method: "GET" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks", method: "GET" } },
);

// POST - Create new task
export const POST = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = await req.json();
      const {
        text,
        status = getDefaultTaskStatus(),
        tags = [],
        priority,
        notes = "",
        blocked_by = [],
        project_id,
      } = body;

      if (!text || typeof text !== "string") {
        throw badRequest(
          "Task text is required and must be a string",
          "INVALID_TASK_TEXT",
        );
      }

      if (!isValidTaskStatus(status)) {
        throw badRequest(
          `Invalid task status: ${status}`,
          "INVALID_TASK_STATUS",
        );
      }

      const db = getDb();

      // Get max sort_order and max task_number in a transaction
      const maxResult = db
        .prepare(
          "SELECT MAX(sort_order) as max_order, MAX(task_number) as max_task_num FROM tasks",
        )
        .get() as { max_order: number | null; max_task_num: number | null };
      const sortOrder = (maxResult?.max_order || 0) + 1;
      const taskNumber = (maxResult?.max_task_num || 0) + 1;

      const result = db
        .prepare(
          `
        INSERT INTO tasks (text, status, tags, priority, sort_order, notes, task_number, blocked_by, project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          text.trim(),
          status,
          JSON.stringify(tags),
          priority || null,
          sortOrder,
          notes,
          taskNumber,
          JSON.stringify(blocked_by),
          project_id || null,
        );

      const newTask = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(result.lastInsertRowid) as DbTask;
      releaseDb(db);

      return NextResponse.json({ task: parseDbTask(newTask) }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/tasks", method: "POST" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks", method: "POST" } },
);

function appendNote(
  existingNotes: RawWorkNote[] | undefined,
  note: RawWorkNote,
  defaultAuthor: WorkNote["author"] = "system",
) {
  const normalizedExisting = normalizeWorkNotes(existingNotes, {
    defaultAuthor,
  });
  const normalizedNote = normalizeWorkNote(note, {
    defaultAuthor,
    fillTimestamp: true,
  });
  return [...normalizedExisting, normalizedNote];
}

// PUT - Update task
export const PUT = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = await req.json();
      const {
        id,
        text,
        status,
        tags,
        priority,
        order,
        notes,
        project_id,
        blocked_by,
        work_notes,
        append_work_note,
        replace_work_notes,
      } = body;

      if (typeof id !== "number") {
        throw badRequest(
          "Task id is required and must be a number",
          "INVALID_TASK_ID",
        );
      }

      if (status !== undefined && !isValidTaskStatus(status)) {
        throw badRequest(
          `Invalid task status: ${status}`,
          "INVALID_TASK_STATUS",
        );
      }

      const db = getDb();

      // Check task exists
      const existing = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(id) as DbTask | undefined;
      if (!existing) {
        releaseDb(db);
        throw notFound(`Task with id ${id} not found`);
      }

      // Build dynamic update
      const updates: string[] = [];
      const params: (string | number | null)[] = [];

      if (text !== undefined) {
        updates.push("text = ?");
        params.push(text.trim());
      }
      if (status !== undefined) {
        updates.push("status = ?");
        params.push(status);
      }
      if (tags !== undefined) {
        updates.push("tags = ?");
        params.push(JSON.stringify(tags));
      }
      if (priority !== undefined) {
        updates.push("priority = ?");
        params.push(priority || null);
      }
      if (order !== undefined) {
        updates.push("sort_order = ?");
        params.push(order);
      }
      if (notes !== undefined) {
        updates.push("notes = ?");
        params.push(notes);
      }
      if (project_id !== undefined) {
        updates.push("project_id = ?");
        params.push(project_id);
      }
      if (blocked_by !== undefined) {
        updates.push("blocked_by = ?");
        params.push(JSON.stringify(blocked_by));
      }

      // Handle work_notes - either append, merge, or replace
      if (append_work_note !== undefined && append_work_note) {
        if (work_notes === undefined) {
          releaseDb(db);
          throw badRequest(
            "work_notes is required when append_work_note is true",
            "WORK_NOTES_REQUIRED",
          );
        }
        const updatedNotes = appendNote(
          JSON.parse(existing.work_notes || "[]"),
          work_notes as RawWorkNote,
        );
        updates.push("work_notes = ?");
        params.push(JSON.stringify(updatedNotes));
      } else if (work_notes !== undefined) {
        const incomingNotes = Array.isArray(work_notes)
          ? (work_notes as RawWorkNote[])
          : [work_notes as RawWorkNote];
        const existingNotes = JSON.parse(existing.work_notes || "[]");
        const updatedNotes = replace_work_notes
          ? normalizeWorkNotes(incomingNotes)
          : mergeWorkNotes(existingNotes, incomingNotes);
        updates.push("work_notes = ?");
        params.push(JSON.stringify(updatedNotes));
      }

      // Validation: Require work_notes when changing to completed (BEFORE update)
      if (status === "completed" && existing.status !== "completed") {
        const existingWorkNotes = JSON.parse(existing.work_notes || "[]");
        const hasWorkNotes =
          Array.isArray(existingWorkNotes) && existingWorkNotes.length > 0;

        // Check if this is being called with a new work note being appended
        const hasNewNoteBeingAdded =
          append_work_note === true && work_notes !== undefined;

        if (!hasWorkNotes && !hasNewNoteBeingAdded) {
          releaseDb(db);
          throw badRequest(
            "Cannot mark task as complete without work notes. Add a summary note first.",
            "WORK_NOTES_REQUIRED",
          );
        }
      }

      if (updates.length > 0) {
        params.push(id);
        db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(
          ...params,
        );
      }

      // Auto-unblock: When a task is completed, remove its task_number from other tasks' blocked_by arrays
      // This runs AFTER the update so the task is confirmed completed
      if (status === "completed" && existing.status !== "completed") {
        const taskNumber = existing.task_number;
        if (taskNumber) {
          // More precise query - escape brackets for LIKE or use GLOB
          const escapedTask = taskNumber.toString();

          const tasksToUnblock = db
            .prepare(
              `
            SELECT id, blocked_by FROM tasks
            WHERE blocked_by LIKE ?
          `,
            )
            .all(`%${escapedTask}%`) as { id: number; blocked_by: string }[];

          for (const task of tasksToUnblock) {
            try {
              const blockedByArray: (number | string)[] = JSON.parse(
                task.blocked_by || "[]",
              );
              const taskNumberStr = String(taskNumber);
              const newBlockedBy = blockedByArray.filter(
                (n) => String(n) !== taskNumberStr,
              );
              db.prepare("UPDATE tasks SET blocked_by = ? WHERE id = ?").run(
                JSON.stringify(newBlockedBy),
                task.id,
              );
            } catch {
              // Skip if JSON parse fails
            }
          }
        }
      }

      const updated = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(id) as DbTask;
      releaseDb(db);

      return NextResponse.json({ task: parseDbTask(updated) });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/tasks", method: "PUT" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks", method: "PUT" } },
);

// PATCH - Reorder tasks within a column
export const PATCH = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = await req.json();
      const { status, taskIds } = body;

      if (!status || !Array.isArray(taskIds)) {
        throw badRequest(
          "status and taskIds are required",
          "INVALID_REORDER_REQUEST",
        );
      }

      if (!isValidTaskStatus(status)) {
        throw badRequest(
          `Invalid task status: ${status}`,
          "INVALID_TASK_STATUS",
        );
      }

      const db = getDb();

      const updateStmt = db.prepare(
        "UPDATE tasks SET sort_order = ? WHERE id = ? AND status = ?",
      );

      const transaction = db.transaction(() => {
        taskIds.forEach((taskId: number, index: number) => {
          updateStmt.run(index * 10, taskId, status);
        });
      });

      transaction();
      releaseDb(db);

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/tasks", method: "PATCH" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks", method: "PATCH" } },
);

// DELETE - Remove task
export const DELETE = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const { searchParams } = new URL(req.url);
      const id = parseInt(searchParams.get("id") || "", 10);

      if (isNaN(id)) {
        throw badRequest(
          "Task id is required and must be a valid number",
          "INVALID_TASK_ID",
        );
      }

      const db = getDb();

      const existing = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(id) as DbTask | undefined;
      if (!existing) {
        releaseDb(db);
        throw notFound(`Task with id ${id} not found`);
      }

      // Remove this task from other tasks' blocked_by arrays before deleting
      const taskNumber = existing.task_number;
      if (taskNumber) {
        const escapedTask = taskNumber.toString();

        const tasksToUpdate = db
          .prepare(
            `
          SELECT id, blocked_by FROM tasks
          WHERE blocked_by LIKE ?
        `,
          )
          .all(`%${escapedTask}%`) as { id: number; blocked_by: string }[];

        for (const task of tasksToUpdate) {
          try {
            const blockedByArray: (number | string)[] = JSON.parse(
              task.blocked_by || "[]",
            );
            const taskNumberStr = String(taskNumber);
            const newBlockedBy = blockedByArray.filter(
              (n) => String(n) !== taskNumberStr,
            );
            db.prepare("UPDATE tasks SET blocked_by = ? WHERE id = ?").run(
              JSON.stringify(newBlockedBy),
              task.id,
            );
          } catch {
            // Skip if JSON parse fails
          }
        }
      }

      db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      releaseDb(db);

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/tasks", method: "DELETE" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks", method: "DELETE" } },
);
