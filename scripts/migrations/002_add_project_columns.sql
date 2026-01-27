-- Migration: Add project columns (tech_stack, local_path, github_repo_url)
-- Run this to add additional columns to the projects table

-- Add new columns if they don't exist
ALTER TABLE projects ADD COLUMN tech_stack TEXT DEFAULT '[]';
ALTER TABLE projects ADD COLUMN local_path TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN github_repo_url TEXT DEFAULT '';
