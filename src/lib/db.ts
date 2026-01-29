import path from "path";
import { getDbPath } from "@/lib/workspace-path";
import { Mutex } from "async-mutex";

// Runtime detection: use bun:sqlite when running in Bun, better-sqlite3 for Node.js builds
const isBun = typeof Bun !== "undefined";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseConstructor: any;
if (isBun) {
  // Dynamic import for bun:sqlite to avoid build-time errors
  DatabaseConstructor = require("bun:sqlite").Database;
} else {
  // Use better-sqlite3 for Node.js (Next.js build workers)
  DatabaseConstructor = require("better-sqlite3");
}

// Generic database interface that works with both implementations
 
export interface DatabaseType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare(sql: string): any;
  exec(sql: string): void;
  close(): void;
   
  transaction<T>(fn: () => T): () => T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const DB_PATH = getDbPath();

// Pool configuration
const POOL_SIZE = 5;
const pool: Array<DatabaseType | null> = [];
const inUse: boolean[] = new Array(POOL_SIZE).fill(false);

// Mutex to prevent race conditions when acquiring connections
const poolMutex = new Mutex();

/**
 * Get a connection from the pool.
 * Uses a mutex to ensure thread-safe access to the pool.
 */
export async function getDb(): Promise<DatabaseType> {
  return await poolMutex.runExclusive(() => {
    // First, try to find an available connection
    for (let i = 0; i < POOL_SIZE; i++) {
      const db = pool[i];
      if (!inUse[i] && db) {
        inUse[i] = true;
        return db;
      }
    }

    // If no available connection, create a new one (fallback)
    const db = new DatabaseConstructor(DB_PATH);
    inUse.push(true);
    pool.push(db);
    return db;
  });
}

/**
 * Return a connection to the pool.
 * Uses a mutex to ensure thread-safe release.
 */
export async function releaseDb(db: DatabaseType): Promise<void> {
  await poolMutex.runExclusive(() => {
    for (let i = 0; i < pool.length; i++) {
      if (pool[i] === db) {
        inUse[i] = false;
        return;
      }
    }
  });
}

/**
 * Initialize the connection pool.
 * Call this once at application startup.
 */
export function initPool(): void {
  for (let i = 0; i < POOL_SIZE; i++) {
    try {
      pool[i] = new DatabaseConstructor(DB_PATH);
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
