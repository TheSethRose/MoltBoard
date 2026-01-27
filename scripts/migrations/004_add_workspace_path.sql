-- Migration: Add workspace_path column to projects table
-- Run this to add workspace path tracking for auto-provisioned directories

-- Add workspace_path column if it doesn't exist
ALTER TABLE projects ADD COLUMN workspace_path TEXT DEFAULT NULL;

-- Add last_sync_at column for tracking GitHub sync timestamps
ALTER TABLE projects ADD COLUMN last_sync_at TEXT DEFAULT NULL;
