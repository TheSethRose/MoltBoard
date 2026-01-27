---
name: task-manager
description: Manage tasks in SQLite database. Use for adding, listing, completing, or blocking tasks. Triggers on task management, todo operations, or heartbeat task processing.
---

# Task Manager

SQLite-backed task management at `~/workspace/data/tasks.db`.

## Status Legend

| Mark  | Status      | Meaning                              |
| ----- | ----------- | ------------------------------------ |
| `[~]` | BACKLOG     | Not ready, waiting to be prioritized |
| `[ ]` | READY       | Actionable now                       |
| `[*]` | IN-PROGRESS | Currently working                    |
| `[x]` | COMPLETED   | Done                                 |
| `[!]` | BLOCKED     | Cannot proceed (has dependencies)    |

## CLI Commands

All commands use: `bun ~/workspace/skills/task-manager/scripts/db-tasks.js`

### List Tasks

```bash
bun ~/workspace/skills/task-manager/scripts/db-tasks.js list [filter]
```

Filters: `backlog`, `ready`, `in-progress`, `completed`, `blocked`, `all` (default)

### Add Task

```bash
bun ~/workspace/skills/task-manager/scripts/db-tasks.js add "<task description>" [backlog|ready]
```

Status defaults to `backlog` (recommended for new tasks).

### Update Task Status

```bash
bun ~/workspace/skills/task-manager/scripts/db-tasks.js update "<pattern>" <status>
```

Statuses: `backlog`, `ready`, `in-progress`, `completed`, `blocked`

### Complete Task

```bash
bun ~/workspace/skills/task-manager/scripts/db-tasks.js complete "<pattern>"
```

Marks matching task as completed.

### Delete Task

```bash
bun ~/workspace/skills/task-manager/scripts/db-tasks.js delete "<pattern>"
```

### Count Tasks

```bash
bun ~/workspace/skills/task-manager/scripts/db-tasks.js count
```

Returns: `Backlog: N | Ready: N | In Progress: N | Completed: N | Blocked: N`

## Heartbeat Integration

1. Run `list ready` to get actionable tasks
2. Research the task before starting (use documentation, search, or browser automation as needed)
3. If unclear or missing prerequisites: `update "<task>" blocked` and add a work note explaining why
4. If clear: update to `in-progress` when starting
5. On success: `complete "<task>"`
6. On failure: `update "<task>" blocked`

## Architecture

- **Database:** `~/workspace/data/tasks.db` (SQLite with WAL mode)
- **CLI:** `skills/task-manager/scripts/db-tasks.js`
- **Dashboard API:** `moltboard/src/app/api/tasks/route.ts`

## Cron Jobs

Set up using MoltBot cron. See [MoltBot Cron Jobs documentation](https://docs.molt.bot/automation/cron-jobs#cron-jobs).

### Task Worker (every 3 minutes)

```bash
moltbot cron add "moltboard-worker" "*/3 * * * *" \
    "./skills/task-manager/scripts/cron-worker.sh"
```

Picks up Ready tasks and processes them one at a time.

### Project Sync (every 15 minutes)

```bash
moltbot cron add "moltboard-sync" "*/15 * * * *" \
    "bun ./skills/task-manager/scripts/project-sync-cron.js"
```

Syncs GitHub issues for projects with `github_repo_url` configured.

## Migration

If migrating from `todo.md`:

```bash
bun ~/workspace/scripts/init-db.js    # Initialize database
bun ~/workspace/scripts/migrate-tasks.js  # Import from todo.md
```
