#!/usr/bin/env node

/**
 * Migration Runner
 *
 * Runs all SQL migrations in the migrations directory that haven't been run yet.
 * Tracks applied migrations in a _migrations table.
 *
 * Usage: node scripts/run-migrations.js
 */

import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import workspacePath from "./workspace-path.js";

const { getWorkspacePath } = workspacePath;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(getWorkspacePath(), "data", "tasks.db");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function runMigrations() {
  log("Starting migration runner...");
  log(`Database: ${DB_PATH}`);
  log(`Migrations dir: ${MIGRATIONS_DIR}`);

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log(`Created data directory: ${dataDir}`);
  }

  // Open database
  const db = new Database(DB_PATH);

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Get list of applied migrations
  const appliedMigrations = db
    .prepare("SELECT name FROM _migrations")
    .all()
    .map((row) => row.name);
  log(`Previously applied migrations: ${appliedMigrations.length}`);

  // Get all migration files
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  log(`Found ${migrationFiles.length} migration files`);

  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of migrationFiles) {
    if (appliedMigrations.includes(file)) {
      skipped++;
      continue;
    }

    log(`Applying migration: ${file}`);
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    try {
      // Run each statement separately (SQLite doesn't support multiple statements well with ALTER TABLE)
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const statement of statements) {
        try {
          db.exec(statement);
        } catch (stmtError) {
          // Ignore "duplicate column" errors for ALTER TABLE
          if (stmtError.message.includes("duplicate column name")) {
            log(
              `  Skipping (column already exists): ${statement.substring(0, 50)}...`,
            );
          } else {
            throw stmtError;
          }
        }
      }

      // Record migration as applied
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      applied++;
      log(`  Applied successfully`);
    } catch (error) {
      errors++;
      log(`  ERROR: ${error.message}`);
    }
  }

  db.close();

  log("---");
  log(
    `Migration complete: ${applied} applied, ${skipped} skipped, ${errors} errors`,
  );

  if (errors > 0) {
    process.exit(1);
  }
}

runMigrations();
