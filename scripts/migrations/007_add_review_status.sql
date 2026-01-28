-- Migration: Allow 'review' task status in SQLite CHECK constraint

BEGIN TRANSACTION;

CREATE TABLE tasks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK(status IN ('backlog', 'ready', 'in-progress', 'pending', 'completed', 'blocked', 'review')),
  priority TEXT CHECK(priority IN ('urgent', 'high', 'medium', 'low', NULL)),
  tags TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT DEFAULT '',
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  task_number INTEGER,
  blocked_by TEXT DEFAULT '[]',
  github_issue_id INTEGER DEFAULT NULL,
  project_id INTEGER REFERENCES projects(id),
  work_notes TEXT DEFAULT '[]'
);

INSERT INTO tasks_new (
  id,
  text,
  status,
  priority,
  tags,
  sort_order,
  created_at,
  updated_at,
  notes,
  title,
  description,
  task_number,
  blocked_by,
  github_issue_id,
  project_id,
  work_notes
)
SELECT
  id,
  text,
  status,
  priority,
  tags,
  sort_order,
  created_at,
  updated_at,
  notes,
  title,
  description,
  task_number,
  blocked_by,
  github_issue_id,
  project_id,
  work_notes
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_sort_order ON tasks(sort_order);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_github_issue_id ON tasks(github_issue_id);

COMMIT;
