import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import { DbTask, parseDbTask } from "@/types/task";
import { isValidTaskStatus } from "@/lib/task-statuses";
import {
  appendWorkNote,
  mergeWorkNotes,
  normalizeWorkNotes,
  createFieldChangeNote,
  type RawWorkNote,
} from "@/lib/work-notes";
import {
  withErrorHandling,
  badRequest,
  notFound,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// GET /api/tasks/[id] - Fetch single task
export const GET = withErrorHandling(
  async (_req: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    try {
      const routeParams = await context?.params;
      const id = parseInt(routeParams?.id ?? "", 10);

      if (isNaN(id)) {
        throw badRequest("Invalid task ID", "INVALID_TASK_ID");
      }

      const db = await getDb();
      const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
        | DbTask
        | undefined;
      await releaseDb(db);

      if (!task) {
        throw notFound(`Task with id ${id} not found`, "TASK_NOT_FOUND");
      }

      return NextResponse.json({ task: parseDbTask(task) });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") throw error;
      logError(error as Error, { route: "/api/tasks/[id]", method: "GET" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks/[id]", method: "GET" } },
);

// PUT /api/tasks/[id] - Update single task
export const PUT = withErrorHandling(
  async (req: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    try {
      const routeParams = await context?.params;
      const id = parseInt(routeParams?.id ?? "", 10);

      if (isNaN(id)) {
        throw badRequest("Invalid task ID", "INVALID_TASK_ID");
      }

      const body = await req.json();
      const {
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

      if (status !== undefined && !isValidTaskStatus(status)) {
        throw badRequest(
          `Invalid task status: ${status}`,
          "INVALID_TASK_STATUS",
        );
      }

      const db = await getDb();

      // Check task exists
      const existing = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(id) as DbTask | undefined;
      if (!existing) {
        await releaseDb(db);
        throw notFound(`Task with id ${id} not found`, "TASK_NOT_FOUND");
      }

      // Build dynamic update
      const updates: string[] = [];
      const paramsList: (string | number | null)[] = [];

      if (text !== undefined) {
        updates.push("text = ?");
        paramsList.push(text.trim());
      }
      if (status !== undefined) {
        updates.push("status = ?");
        paramsList.push(status);
      }
      if (tags !== undefined) {
        updates.push("tags = ?");
        paramsList.push(JSON.stringify(tags));
      }
      if (priority !== undefined) {
        updates.push("priority = ?");
        paramsList.push(priority || null);
      }
      if (order !== undefined) {
        updates.push("sort_order = ?");
        paramsList.push(order);
      }
      if (notes !== undefined) {
        updates.push("notes = ?");
        paramsList.push(notes);
      }
      if (project_id !== undefined) {
        updates.push("project_id = ?");
        paramsList.push(project_id);
      }
      if (blocked_by !== undefined) {
        updates.push("blocked_by = ?");
        paramsList.push(JSON.stringify(blocked_by));
      }

      // Handle work_notes - either append, merge, or replace
      // WARNING: replace_work_notes=true will wipe all existing notes!
      let currentWorkNotes = JSON.parse(existing.work_notes || "[]");
      let workNotesChanged = false;

      if (append_work_note !== undefined && append_work_note) {
        if (work_notes === undefined) {
          await releaseDb(db);
          throw badRequest(
            "work_notes is required when append_work_note is true",
            "WORK_NOTES_REQUIRED",
          );
        }
        currentWorkNotes = appendWorkNote(
          currentWorkNotes,
          work_notes as RawWorkNote,
        );
        workNotesChanged = true;
      } else if (work_notes !== undefined) {
        const incomingNotes = Array.isArray(work_notes)
          ? (work_notes as RawWorkNote[])
          : [work_notes as RawWorkNote];
        if (replace_work_notes && currentWorkNotes.length > 0) {
          console.warn(
            `[WARN] replace_work_notes=true for task ${id}, wiping ${currentWorkNotes.length} existing notes`,
          );
        }
        currentWorkNotes = replace_work_notes
          ? normalizeWorkNotes(incomingNotes)
          : mergeWorkNotes(currentWorkNotes, incomingNotes);
        workNotesChanged = true;
      }

      // Auto-log field changes as system work notes
      const fieldChanges: RawWorkNote[] = [];

      if (status !== undefined && status !== existing.status) {
        const note = createFieldChangeNote("status", existing.status, status);
        if (note) fieldChanges.push(note);
      }

      if (priority !== undefined && priority !== existing.priority) {
        const note = createFieldChangeNote(
          "priority",
          existing.priority,
          priority,
        );
        if (note) fieldChanges.push(note);
      }

      if (tags !== undefined) {
        const existingTags = JSON.parse(existing.tags || "[]");
        const note = createFieldChangeNote("tags", existingTags, tags);
        if (note) fieldChanges.push(note);
      }

      if (project_id !== undefined && project_id !== existing.project_id) {
        const note = createFieldChangeNote(
          "project",
          existing.project_id,
          project_id,
        );
        if (note) fieldChanges.push(note);
      }

      // Append all field change notes
      if (fieldChanges.length > 0) {
        for (const note of fieldChanges) {
          currentWorkNotes = appendWorkNote(currentWorkNotes, note);
        }
        workNotesChanged = true;
      }

      // Update work_notes if changed
      if (workNotesChanged) {
        updates.push("work_notes = ?");
        paramsList.push(JSON.stringify(currentWorkNotes));
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
          await releaseDb(db);
          throw badRequest(
            "Cannot mark task as complete without work notes. Add a summary note first.",
            "WORK_NOTES_REQUIRED",
          );
        }
      }

      if (updates.length > 0) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        paramsList.push(id);
        db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(
          ...paramsList,
        );
      }

      // Auto-unblock: When a task is completed, remove its task_number from other tasks' blocked_by arrays
      // This runs AFTER the update so the task is confirmed completed
      if (status === "completed" && existing.status !== "completed") {
        const taskNumber = existing.task_number;
        if (taskNumber) {
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
      await releaseDb(db);

      return NextResponse.json({ task: parseDbTask(updated) });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") throw error;
      logError(error as Error, { route: "/api/tasks/[id]", method: "PUT" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks/[id]", method: "PUT" } },
);

// DELETE /api/tasks/[id] - Delete single task
export const DELETE = withErrorHandling(
  async (_req: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    try {
      const routeParams = await context?.params;
      const id = parseInt(routeParams?.id ?? "", 10);

      if (isNaN(id)) {
        throw badRequest("Invalid task ID", "INVALID_TASK_ID");
      }

      const db = await getDb();

      const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      if (!existing) {
        await releaseDb(db);
        throw notFound(`Task with id ${id} not found`, "TASK_NOT_FOUND");
      }

      // Remove this task from other tasks' blocked_by arrays before deleting
      const taskNumber = (existing as DbTask).task_number;
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
      await releaseDb(db);

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") throw error;
      logError(error as Error, { route: "/api/tasks/[id]", method: "DELETE" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks/[id]", method: "DELETE" } },
);
