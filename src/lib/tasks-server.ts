/**
 * Server-side task fetching utilities.
 * Uses direct SQLite access for initial SSR render.
 */

import { getDbPath } from "@/lib/workspace-path";
import { Task, parseDbTask, type DbTask } from "@/types/task";

// Runtime detection: use bun:sqlite when running in Bun, better-sqlite3 for Node.js builds
const isBun = typeof Bun !== "undefined";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseConstructor: any;
if (isBun) {
  const bunSqlite = await import("bun:sqlite");
  DatabaseConstructor = bunSqlite.Database;
} else {
  const betterSqlite3 = await import("better-sqlite3");
  DatabaseConstructor = betterSqlite3.default;
}

const DB_PATH = getDbPath();

function getDb() {
  return new DatabaseConstructor(DB_PATH);
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
