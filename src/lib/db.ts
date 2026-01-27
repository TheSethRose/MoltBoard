import { Database } from "bun:sqlite";
import path from "path";
import { getWorkspacePath } from "@/lib/workspace-path";

const DB_PATH = path.join(getWorkspacePath(), "data", "tasks.db");

// Pool configuration
const POOL_SIZE = 5;
const pool: Array<Database | null> = [];
const inUse: boolean[] = new Array(POOL_SIZE).fill(false);

/**
 * Get a connection from the pool.
 * Uses a simple FIFO approach with busy-wait fallback.
 */
export function getDb(): Database {
  // First, try to find an available connection
  for (let i = 0; i < POOL_SIZE; i++) {
    const db = pool[i];
    if (!inUse[i] && db) {
      inUse[i] = true;
      return db;
    }
  }

  // If no available connection, create a new one (fallback)
  // In production, you might want to wait or throw instead
  const db = new Database(DB_PATH);
  inUse.push(true);
  pool.push(db);
  return db;
}

/**
 * Return a connection to the pool.
 */
export function releaseDb(db: Database): void {
  for (let i = 0; i < pool.length; i++) {
    if (pool[i] === db) {
      inUse[i] = false;
      return;
    }
  }
}

/**
 * Initialize the connection pool.
 * Call this once at application startup.
 */
export function initPool(): void {
  for (let i = 0; i < POOL_SIZE; i++) {
    try {
      pool[i] = new Database(DB_PATH);
      inUse[i] = false;
    } catch (error) {
      console.error(`Failed to create database connection ${i}:`, error);
    }
  }
  console.log(
    `Database pool initialized with ${pool.filter((db) => db).length} connections`,
  );
}

/**
 * Close all connections in the pool.
 * Call this during graceful shutdown.
 */
export function closePool(): void {
  for (let i = 0; i < pool.length; i++) {
    const db = pool[i];
    if (db) {
      try {
        db.close();
      } catch (error) {
        console.error(`Error closing database connection ${i}:`, error);
      }
    }
    pool[i] = null;
    inUse[i] = false;
  }
  console.log("Database pool closed");
}

// Initialize pool on module load
initPool();
