import { NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  databaseError,
  logError,
} from "@/lib/api-error-handler";

interface MetricRow {
  date: string;
  tasks_completed: number;
  tasks_created: number;
  uptime_seconds: number;
}

// GET - Fetch metrics history (last 7 days)
export const GET = withErrorHandling(
  async (): Promise<NextResponse> => {
    try {
      const db = getDb();

      // Get last 7 days of metrics
      const rows = db
        .prepare(
          `
        SELECT date, tasks_completed, tasks_created, uptime_seconds
        FROM metrics_history
        ORDER BY date DESC
        LIMIT 7
      `,
        )
        .all() as MetricRow[];

      // Get today's task counts
      const today = new Date().toISOString().split("T")[0];
      const todayStats = db
        .prepare(
          `
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(*) as total
        FROM tasks
      `,
        )
        .get() as { completed: number; total: number };

      releaseDb(db);

      return NextResponse.json({
        history: rows.reverse(), // Oldest to newest for charts
        today: {
          date: today,
          completed: todayStats.completed,
          total: todayStats.total,
        },
      });
    } catch (error) {
      logError(error as Error, { route: "/api/metrics", method: "GET" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/metrics", method: "GET" } },
);

// POST - Capture today's metrics (called by cron/heartbeat)
export const POST = withErrorHandling(
  async (): Promise<NextResponse> => {
    try {
      const db = getDb();
      const today = new Date().toISOString().split("T")[0];

      // Get current task counts
      const stats = db
        .prepare(
          `
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(*) as total
        FROM tasks
      `,
        )
        .get() as { completed: number; total: number };

      // Upsert today's metrics
      db.prepare(
        `
        INSERT INTO metrics_history (date, tasks_completed, tasks_created)
        VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          tasks_completed = excluded.tasks_completed,
          tasks_created = excluded.tasks_created,
          captured_at = CURRENT_TIMESTAMP
      `,
      ).run(today, stats.completed, stats.total);

      releaseDb(db);

      return NextResponse.json({ success: true, date: today, ...stats });
    } catch (error) {
      logError(error as Error, { route: "/api/metrics", method: "POST" });
      throw databaseError(error);
    }
  },
  { context: { route: "/api/metrics", method: "POST" } },
);
