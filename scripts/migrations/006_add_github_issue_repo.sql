-- Migration: Add github_issue_repo to tasks for fork/parent issue tracking

ALTER TABLE tasks ADD COLUMN github_issue_repo TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_github_issue_repo ON tasks(github_issue_repo);
