-- Migration: Add github_issue_id column to tasks table
-- Run this to add GitHub issue tracking support

-- Add github_issue_id column if it doesn't exist
-- This column stores the GitHub issue number for synced tasks
ALTER TABLE tasks ADD COLUMN github_issue_id INTEGER DEFAULT NULL;

-- Create index for efficient lookups when syncing
CREATE INDEX IF NOT EXISTS idx_tasks_github_issue_id ON tasks(github_issue_id);

-- Add work_notes column for task progress tracking (JSON array)
ALTER TABLE tasks ADD COLUMN work_notes TEXT DEFAULT '[]';
