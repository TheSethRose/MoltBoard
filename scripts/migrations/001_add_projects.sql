-- Migration: Add project_id foreign key to tasks table
-- Run this to add projects support to the database

-- Create projects table if it doesn't exist
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  tech_stack TEXT DEFAULT '[]',    -- JSON array of technologies
  local_path TEXT DEFAULT '',      -- Local filesystem path
  github_repo_url TEXT DEFAULT '', -- GitHub repository URL
  color TEXT DEFAULT '#3B82F6',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- First, create the tasks table if it doesn't exist
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_number INTEGER,
  status TEXT DEFAULT 'backlog',
  text TEXT NOT NULL,
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  priority TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  blocked_by TEXT DEFAULT '[]',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
