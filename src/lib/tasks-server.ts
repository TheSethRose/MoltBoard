/**
 * Server-side task fetching utilities.
 * Uses direct SQLite access for initial SSR render.
 */

import { Database } from "bun:sqlite";
import path from "path";
import { getWorkspacePath } from "@/lib/workspace-path";
import { Task, parseDbTask, type DbTask } from "@/types/task";

const DB_PATH = path.join(getWorkspacePath(), "data", "tasks.db");

function getDb() {
  return new Database(DB_PATH);
}

/**
 * Fetches all tasks from the database for server-side rendering.
 * Returns tasks sorted by priority and order.
 */
export async function getTasks(): Promise<Task[]> {
  try {
    const db = await getDb();
    const rows = db
      .prepare(
        `
      SELECT * FROM tasks 
      ORDER BY 
        CASE priority 
          WHEN 'urgent' THEN 0 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
          ELSE 4 
        END,
        sort_order ASC,
        id ASC
    `,
      )
      .all() as DbTask[];
    db.close();

    return rows.map((row) => parseDbTask(row));
  } catch (error) {
    console.error("Failed to fetch tasks on server:", error);
    return [];
  }
}
