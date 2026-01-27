-- Migration: Add github_sync_settings column to projects table
-- This stores user preferences for which GitHub issues to sync

-- Add github_sync_settings JSON column
-- Format: { "mode": "all"|"selected"|"exclude", "issues": [1, 2, 3] }
-- - "all": sync all issues (default behavior)
-- - "selected": only sync issues in the issues array
-- - "exclude": sync all except issues in the issues array
ALTER TABLE projects ADD COLUMN github_sync_settings TEXT DEFAULT '{"mode":"all","issues":[]}';
