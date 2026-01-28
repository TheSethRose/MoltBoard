# MoltBoard Database Schema

## Entity Relationship Overview

```
┌─────────────────┐       ┌─────────────────┐
│    projects     │◄──────│      tasks      │
│                 │  1:N  │                 │
└─────────────────┘       └─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────┐
│   metrics_history   │
└─────────────────────┘
```

## Tables

### `tasks`

The central entity representing work items tracked by MoltBoard.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `task_number` | INTEGER | Human-readable sequential number (e.g., #34, #35) |
| `text` | TEXT | Task description/title |
| `status` | TEXT | Current status: `backlog`, `ready`, `in-progress`, `pending`, `completed`, `blocked`, `review` |
| `priority` | TEXT | Priority level: `urgent`, `high`, `medium`, `low` |
| `tags` | TEXT | JSON array of tags (e.g., `["enhancement", "bug"]`) |
| `sort_order` | INTEGER | Manual ordering within status |
| `title` | TEXT | Optional formal title for groomed tasks |
| `description` | TEXT | Detailed problem statement and context |
| `notes` | TEXT | General task notes |
| `blocked_by` | TEXT | JSON array of task IDs that block this task |
| `project_id` | INTEGER | Foreign key to `projects.id` |
| `github_issue_id` | INTEGER | Linked GitHub issue number |
| `work_notes` | TEXT | JSON array of work activity log entries |
| `created_at` | DATETIME | Record creation timestamp |
| `updated_at` | DATETIME | Last modification timestamp |

#### Indexes

```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_sort_order ON tasks(sort_order);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_github_issue_id ON tasks(github_issue_id);
```

### `projects`

Projects that contain tasks and sync with external sources.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `name` | TEXT | Project display name |
| `description` | TEXT | Project description |
| `github_repo_url` | TEXT | Full GitHub repository URL |
| `local_only` | INTEGER | Boolean flag for local-only projects |
| `auto_provision_workspace` | INTEGER | Auto-create workspace folder |
| `local_path` | TEXT | Absolute path to local project |
| `workspace_path` | TEXT | Workspace-relative path |
| `tech_stack` | TEXT | Technology stack notes |
| `github_sync_settings` | JSON | Sync configuration: `{"mode":"all","issues":[]}` |
| `last_sync_at` | DATETIME | Last GitHub sync timestamp |
| `created_at` | DATETIME | Record creation timestamp |
| `updated_at` | DATETIME | Last modification timestamp |

### `metrics_history`

Daily aggregated metrics for tracking productivity.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `date` | TEXT | Date in YYYY-MM-DD format (UNIQUE) |
| `tasks_completed` | INTEGER | Number of tasks completed that day |
| `tasks_created` | INTEGER | Number of tasks created that day |
| `uptime_seconds` | INTEGER | System uptime in seconds |
| `captured_at` | DATETIME | Record creation timestamp |

### `_migrations`

Internal migration tracking table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `name` | TEXT | Migration file name (UNIQUE) |
| `applied_at` | DATETIME | When migration was applied |

### `sqlite_sequence`

Internal SQLite sequence tracking for AUTOINCREMENT.

## JSON Field Schemas

### `tasks.work_notes`

```typescript
interface WorkNote {
  id: string;           // UUID
  content: string;      // Note text
  author: "agent" | "system" | "human";
  timestamp: string;    // ISO datetime
}
```

### `tasks.tags`

```typescript
string[]  // Array of tag strings
```

### `tasks.blocked_by`

```typescript
number[]  // Array of task IDs
```

### `projects.github_sync_settings`

```typescript
{
  mode: "all" | "issues" | "none";
  issues: number[];  // GitHub issue numbers to sync
}
```

## Relationships

- **projects → tasks**: One project can have many tasks (`1:N` via `project_id`)
- **tasks.blocked_by**: Self-referential array of task IDs

## Query Examples

### Get all tasks for a project

```sql
SELECT * FROM tasks WHERE project_id = 1 ORDER BY sort_order;
```

### Get tasks blocking a specific task

```sql
SELECT t.* FROM tasks t, json_each(tasks.blocked_by) 
WHERE tasks.id = 5 AND json_each.value = t.id;
```

### Get metrics for last 7 days

```sql
SELECT * FROM metrics_history 
ORDER BY date DESC LIMIT 7;
```
