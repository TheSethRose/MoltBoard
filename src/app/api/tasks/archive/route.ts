import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import { withErrorHandling, badRequest, logError } from "@/lib/api-error-handler";

// POST /api/tasks/archive - Archive old completed tasks
export const POST = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = await req.json();
      const {
        daysOld = 30, // Default: archive tasks completed more than 30 days ago
        archiveOnly = true, // If true, soft-delete; if false, hard-delete
      } = body;

      if (typeof daysOld !== "number" || daysOld < 0) {
        throw badRequest("daysOld must be a non-negative number", "INVALID_DAYS_OLD");
      }

      const db = await getDb();

      // Find completed tasks older than the specified days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffISO = cutoffDate.toISOString();

      // Get tasks to archive
      const tasksToArchive = db
        .prepare(
          `
          SELECT id, task_number, text, status, completed_at
          FROM tasks
          WHERE status = 'completed'
            AND completed_at IS NOT NULL
            AND completed_at < ?
            AND (archived_at IS NULL OR archived_at = '')
        `,
        )
        .all(cutoffISO) as {
          id: number;
          task_number: number;
          text: string;
          status: string;
          completed_at: string;
        }[];

      if (tasksToArchive.length === 0) {
        await releaseDb(db);
        return NextResponse.json({
          success: true,
          message: "No tasks to archive",
          archived: 0,
        });
      }

      if (archiveOnly) {
        // Soft delete: mark as archived
        const now = new Date().toISOString();
        const placeholders = tasksToArchive.map(() => "?").join(",");
        const ids = tasksToArchive.map((t) => t.id);

        db
          .prepare(
            `
            UPDATE tasks
            SET archived_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders})
          `,
          )
          .run(now, ...ids);

        await releaseDb(db);

        return NextResponse.json({
          success: true,
          message: `Archived ${tasksToArchive.length} completed task(s)`,
          archived: tasksToArchive.length,
          tasks: tasksToArchive.map((t) => ({
            id: t.id,
            task_number: t.task_number,
            text: t.text,
            completed_at: t.completed_at,
          })),
        });
      } else {
        // Hard delete: permanently remove tasks
        const placeholders = tasksToArchive.map(() => "?").join(",");
        const ids = tasksToArchive.map((t) => t.id);

        // Delete associated data first
        db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);

        await releaseDb(db);

        return NextResponse.json({
          success: true,
          message: `Permanently deleted ${tasksToArchive.length} task(s)`,
          deleted: tasksToArchive.length,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/tasks/archive", method: "POST" });
      throw error;
    }
  },
  { context: { route: "/api/tasks/archive", method: "POST" } },
);

// GET /api/tasks/archive - Get info about tasks that can be archived
export const GET = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const { searchParams } = new URL(req.url);
      const daysOld = parseInt(searchParams.get("days") || "30", 10);

      if (isNaN(daysOld) || daysOld < 0) {
        throw badRequest("days must be a non-negative number", "INVALID_DAYS");
      }

      const db = await getDb();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffISO = cutoffDate.toISOString();

      // Count tasks eligible for archiving
      const count = db
        .prepare(
          `
          SELECT COUNT(*) as count
          FROM tasks
          WHERE status = 'completed'
            AND completed_at IS NOT NULL
            AND completed_at < ?
            AND (archived_at IS NULL OR archived_at = '')
        `,
        )
        .get(cutoffISO) as { count: number };

      // Get oldest completed task for reference
      const oldestTask = db
        .prepare(
          `
          SELECT id, task_number, text, completed_at
          FROM tasks
          WHERE status = 'completed'
            AND completed_at IS NOT NULL
          ORDER BY completed_at ASC
          LIMIT 1
        `,
        )
        .get() as { id: number; task_number: number; text: string; completed_at: string } | undefined;

      await releaseDb(db);

      return NextResponse.json({
        eligibleForArchive: count.count,
        cutoffDate: cutoffISO,
        oldestCompletedTask: oldestTask || null,
        daysThreshold: daysOld,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") {
        throw error;
      }
      logError(error as Error, { route: "/api/tasks/archive", method: "GET" });
      throw error;
    }
  },
  { context: { route: "/api/tasks/archive", method: "GET" } },
);
