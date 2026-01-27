import { NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import { withErrorHandling, logError } from "@/lib/api-error-handler";

// GET - Fetch database status
export const GET = withErrorHandling(
  async (): Promise<NextResponse> => {
    try {
      const db = getDb();
      // Simple query to check if database is accessible
      const result = db
        .prepare("SELECT COUNT(*) as count FROM tasks")
        .get() as { count: number };
      releaseDb(db);

      return NextResponse.json({
        database: "connected",
        tasksCount: result.count,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logError(error as Error, {
        route: "/api/status/database",
        method: "GET",
      });
      return NextResponse.json({
        database: "unavailable",
        tasksCount: 0,
        timestamp: new Date().toISOString(),
      });
    }
  },
  { context: { route: "/api/status/database", method: "GET" } },
);
