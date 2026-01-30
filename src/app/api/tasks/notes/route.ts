import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import { DbTask } from "@/types/task";
import type { WorkNote } from "@/types/task";
import {
  withErrorHandling,
  badRequest,
  notFound,
  forbidden,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

// DELETE /api/tasks/notes - Delete a work note (soft delete)
export const DELETE = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const uiHeader = req.headers.get("x-moltboard-ui");
      const secFetchSite = req.headers.get("sec-fetch-site");

      // For same-origin requests from browser, sec-fetch-site will be "same-origin"
      // Also accept our custom header for extra safety
      const isSameOrigin = secFetchSite === "same-origin";

      if (uiHeader !== "1" || !isSameOrigin) {
        console.warn("[DELETE /api/tasks/notes] blocked non-UI request", {
          uiHeader,
          secFetchSite,
        });
        throw forbidden("This action is only allowed from the UI");
      }

      const { searchParams } = new URL(req.url);
      const taskIdParam = searchParams.get("task_id");
      const taskNumberParam = searchParams.get("task_number");
      const taskId = taskIdParam ? parseInt(taskIdParam, 10) : NaN;
      const taskNumber = taskNumberParam ? parseInt(taskNumberParam, 10) : NaN;
      const noteId = searchParams.get("note_id");

      if (
        (isNaN(taskId) || taskId <= 0) &&
        (isNaN(taskNumber) || taskNumber <= 0)
      ) {
        console.warn("[DELETE /api/tasks/notes] invalid task id", {
          taskIdParam,
          taskNumberParam,
          noteId,
        });
        throw badRequest(
          "task_id or task_number is required and must be a valid number",
          "INVALID_TASK_ID",
        );
      }

      if (!noteId || typeof noteId !== "string") {
        console.warn("[DELETE /api/tasks/notes] invalid note id", { noteId });
        throw badRequest("note_id is required", "INVALID_NOTE_ID");
      }

      const db = await getDb();

      // Check task exists - prefer task_id if valid, fall back to task_number
      const existing = (
        !isNaN(taskId) && taskId > 0
          ? db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId)
          : db
              .prepare("SELECT * FROM tasks WHERE task_number = ?")
              .get(taskNumber)
      ) as DbTask | undefined;

      if (!existing) {
        await releaseDb(db);
        console.warn("[DELETE /api/tasks/notes] task not found", {
          taskId,
          taskNumber,
          noteId,
        });
        throw notFound(
          !isNaN(taskId) && taskId > 0
            ? `Task with id ${taskId} not found`
            : `Task with number ${taskNumber} not found`,
        );
      }

      // Parse work notes and find the note to delete
      const workNotes: WorkNote[] = JSON.parse(existing.work_notes || "[]");
      const noteIndex = workNotes.findIndex((n) => n.id === noteId);

      if (noteIndex === -1) {
        await releaseDb(db);
        console.warn("[DELETE /api/tasks/notes] note not found", {
          taskId: existing.id,
          taskNumber: existing.task_number,
          noteId,
        });
        throw notFound(`Note with id ${noteId} not found`);
      }

      // Mark note as deleted
      const deletedNote = {
        ...workNotes[noteIndex],
        deleted: true,
        deleted_by: "human" as const,
        deleted_at: new Date().toISOString(),
      };

      // Create a system note about the deletion
      const deletionNote: WorkNote = {
        id: crypto.randomUUID(),
        content: `Deleted comment: "${workNotes[noteIndex].content.substring(0, 100)}${workNotes[noteIndex].content.length > 100 ? "..." : ""}"`,
        author: "system",
        timestamp: new Date().toISOString(),
      };

      // Update the work notes array
      const updatedWorkNotes = [...workNotes];
      updatedWorkNotes[noteIndex] = deletedNote;
      updatedWorkNotes.push(deletionNote);

      db.prepare("UPDATE tasks SET work_notes = ? WHERE id = ?").run(
        JSON.stringify(updatedWorkNotes),
        existing.id,
      );

      await releaseDb(db);

      return NextResponse.json({
        success: true,
        noteId,
        taskId: existing.id,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/tasks/notes", method: "DELETE" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/tasks/notes", method: "DELETE" } },
);
