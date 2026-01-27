# MoltBoard Infrastructure

This document provides a technical overview of how MoltBoard works, including its architecture, data flow, and integration points.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              MoltBoard                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Browser   │───▶│  Next.js    │───▶│   SQLite    │                 │
│  │   (React)   │◀───│  API Routes │◀───│  Database   │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│         │                  │                  ▲                         │
│         │                  │                  │                         │
│         │                  ▼                  │                         │
│         │           ┌─────────────┐           │                         │
│         │           │  GitHub API │           │                         │
│         │           │  (Octokit)  │           │                         │
│         │           └─────────────┘           │                         │
│         │                                     │                         │
│         │           ┌─────────────┐           │                         │
│         └──────────▶│  CLI Tools  │───────────┘                         │
│                     │    (Bun)    │                                     │
│                     └─────────────┘                                     │
│                            │                                            │
│                            ▼                                            │
│                     ┌─────────────┐                                     │
│                     │ Cron Workers│                                     │
│                     └─────────────┘                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Web Application (Next.js)

**Location:** `src/`

MoltBoard uses Next.js 16 with the App Router for both frontend and backend:

```
src/
├── app/
│   ├── (dashboard)/          # Route group for dashboard pages
│   │   ├── layout.tsx        # Sidebar layout wrapper
│   │   ├── tasks/            # Task management UI
│   │   ├── projects/         # Project management UI
│   │   └── status/           # System monitoring UI
│   ├── api/                  # REST API endpoints
│   │   ├── tasks/            # Task CRUD operations
│   │   ├── projects/         # Project CRUD + GitHub sync
│   │   └── status/           # Health checks
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Landing redirect
├── components/
│   ├── ui/                   # Reusable UI components
│   └── dashboard/            # Dashboard-specific components
├── lib/
│   ├── db.ts                 # Database connection pool
│   ├── github.ts             # GitHub API client
│   ├── workspace-path.ts     # Workspace resolution
│   └── api-error-handler.ts  # Error handling utilities
└── types/
    ├── task.ts               # Task type definitions
    └── project.ts            # Project type definitions
```

### 2. Database (SQLite)

**Location:** `data/tasks.db`

SQLite with WAL (Write-Ahead Logging) mode for concurrent read/write access.

#### Schema

```sql
-- Tasks table
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_number INTEGER,
    text TEXT NOT NULL,
    status TEXT DEFAULT 'backlog',
    priority TEXT,
    tags TEXT DEFAULT '[]',           -- JSON array
    work_notes TEXT DEFAULT '[]',     -- JSON array
    blocked_by TEXT DEFAULT '[]',     -- JSON array of task IDs
    sort_order INTEGER DEFAULT 0,
    project_id INTEGER,
    github_issue_id INTEGER,
    github_issue_repo TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Projects table
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    tech_stack TEXT DEFAULT '[]',     -- JSON array
    local_path TEXT,
    workspace_path TEXT,
    github_repo_url TEXT,
    github_sync_settings TEXT,        -- JSON object
    auto_provision_workspace INTEGER DEFAULT 0,
    last_synced_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Migrations tracking
CREATE TABLE _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT DEFAULT (datetime('now'))
);
```

#### Connection Pool

```typescript
// src/lib/db.ts
const POOL_SIZE = 5;
const pool: Database[] = [];

export function getDb(): Database {
  if (pool.length > 0) {
    return pool.pop()!;
  }
  const db = new Database(getDatabasePath());
  db.pragma("journal_mode = WAL");
  return db;
}

export function releaseDb(db: Database): void {
  if (pool.length < POOL_SIZE) {
    pool.push(db);
  } else {
    db.close();
  }
}
```

### 3. GitHub Integration

**Location:** `src/lib/github.ts`

Uses Octokit for GitHub API access with built-in rate limiting awareness.

```typescript
// Rate limit handling
interface RateLimitInfo {
  remaining: number;
  reset: Date;
  limit: number;
}

// Issue sync flow
async function syncGitHubIssues(projectId: number): Promise<SyncResult> {
  // 1. Get project with GitHub settings
  // 2. Fetch issues from GitHub API
  // 3. Match with existing tasks by github_issue_id
  // 4. Create new tasks for new issues
  // 5. Update existing tasks if issue changed
  // 6. Optionally close tasks for closed issues
}
```

#### Sync Settings

Projects can configure selective issue sync:

```json
{
  "syncEnabled": true,
  "syncLabels": ["bug", "enhancement"],
  "syncAssignees": ["username"],
  "autoCloseOnRemote": false,
  "createLocalTasks": true
}
```

### 4. Workspace Configuration

**Location:** `src/lib/workspace-path.ts`

MoltBoard resolves the workspace directory in this order:

1. `MOLTBOT_WORKSPACE` environment variable
2. `WORKSPACE_DIR` environment variable
3. `~/.clawdbot/clawdbot.json` → `agents.defaults.workspace` (current)
4. `~/.moltbot/moltbot.json` → `agents.defaults.workspace` (future)
5. Default: `~/workspace`

```typescript
const CONFIG_PATHS = [
  path.join(homedir(), ".clawdbot", "clawdbot.json"), // Current
  path.join(homedir(), ".moltbot", "moltbot.json"), // Future
];

export function getWorkspacePath(): string {
  // 1. Check environment variables first
  const env = process.env.MOLTBOT_WORKSPACE || process.env.WORKSPACE_DIR;
  if (env?.trim()) return env.trim();

  // 2. Check config files
  for (const configPath of CONFIG_PATHS) {
    try {
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const workspace = data?.agents?.defaults?.workspace;
        if (workspace?.trim()) return workspace.trim();
      }
    } catch {
      /* continue */
    }
  }

  // 3. Fallback to default
  return path.join(homedir(), "workspace");
}
```

---

## Data Flow

### Task Creation

```
User Input → React Form → API Route → SQLite → Response → UI Update
     │            │            │          │         │          │
     └────────────┴────────────┴──────────┴─────────┴──────────┘
                              ~50ms round trip
```

1. User fills task form in browser
2. React component calls `POST /api/tasks`
3. API route validates input with Zod schema
4. Database insert with auto-increment ID
5. New task returned with generated fields
6. SWR cache invalidated, UI re-renders

### GitHub Issue Sync

```
Cron Trigger → API Route → GitHub API → Compare → SQLite → Log
     │             │            │          │         │       │
     └─────────────┴────────────┴──────────┴─────────┴───────┘
                         ~2-5s per project
```

1. Cron job triggers every 15 minutes
2. Calls `POST /api/projects/[id]/sync`
3. Fetches issues from GitHub (paginated)
4. Compares with existing tasks by `github_issue_id`
5. Inserts new, updates changed, optionally closes
6. Updates `last_synced_at` timestamp

### Task Status Updates

```
Drag & Drop → Optimistic Update → API Call → Confirm/Rollback
     │              │                 │              │
     └──────────────┴─────────────────┴──────────────┘
                    <100ms perceived latency
```

1. User drags task to new column
2. UI immediately updates (optimistic)
3. `PUT /api/tasks` with new status
4. On success: mutation confirmed
5. On failure: rollback to previous state

---

## API Layer

### Error Handling

All API routes use a unified error handler:

```typescript
// src/lib/api-error-handler.ts
export function withErrorHandling(
  handler: () => Promise<NextResponse>,
  options: { context: { route: string; method: string } },
): () => Promise<NextResponse> {
  return async () => {
    try {
      return await handler();
    } catch (error) {
      logError(error, options.context);

      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error instanceof DatabaseError) {
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
```

### Request Validation

Input validation using TypeScript types:

```typescript
// Task creation validation
interface CreateTaskInput {
  text: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  project_id?: number;
}

// Validated at runtime in API routes
function validateTaskInput(body: unknown): CreateTaskInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid request body");
  }
  if (!("text" in body) || typeof body.text !== "string") {
    throw new ValidationError("Task text is required");
  }
  // ... additional validation
}
```

---

## CLI Tools

### Task Manager CLI

**Location:** `skills/task-manager/scripts/db-tasks.js`

Direct database access for command-line task management:

```javascript
// Usage patterns
const commands = {
  list: (filter) => {
    // SELECT with optional WHERE clause
    // Format output with status markers
  },
  add: (text, status) => {
    // INSERT new task
    // Return task ID
  },
  update: (pattern, status) => {
    // Find by text pattern or ID
    // UPDATE status
  },
  complete: (pattern) => {
    // Mark as completed
    // Update tasks blocked by this one
  },
  delete: (pattern) => {
    // Remove task
    // Cascade blocked_by references
  },
  count: () => {
    // GROUP BY status
    // Return counts
  },
};
```

### Background Workers

**Location:** `skills/task-manager/scripts/`

#### Cron Worker (`cron-worker.sh`)

Orchestrates periodic tasks:

```bash
#!/bin/bash
# Runs every 3 minutes via crontab

# Phase 0: Backup workspace
./backup.sh || true

# Phase 1: Process tasks
bun ./recurring-work.js
```

#### Backup Script (`backup.sh`)

Workspace state preservation:

```bash
#!/bin/bash
# Backs up workspace to recovery repo

# 1. Detect workspace from config
WORKSPACE=$(get_workspace_dir)

# 2. Copy database files
cp $WORKSPACE/data/tasks.db* ./data/

# 3. Exclude remote-backed projects
for project in $WORKSPACE/projects/*; do
    if has_remote_origin "$project"; then
        add_to_gitignore "$project"
    fi
done

# 4. Commit changes
git add -A
git commit -m "backup($(date)): +$added ~$modified"
git push origin main
```

#### Project Sync (`project-sync-cron.js`)

Automated GitHub synchronization:

```javascript
// Runs every 15 minutes
async function syncAllProjects() {
  const projects = db
    .prepare(
      `
        SELECT id, name, github_repo_url
        FROM projects
        WHERE github_repo_url IS NOT NULL
    `,
    )
    .all();

  for (const project of projects) {
    try {
      const response = await fetch(
        `http://localhost:5000/api/projects/${project.id}/sync`,
        { method: "POST" },
      );
      const result = await response.json();
      log(
        `${project.name}: ${result.created} created, ${result.updated} updated`,
      );
    } catch (error) {
      log(`${project.name}: sync failed - ${error.message}`);
    }
  }
}
```

---

## Frontend Architecture

### State Management

Uses SWR for data fetching with optimistic updates:

```typescript
// src/app/(dashboard)/tasks/lib/use-tasks.ts
export function useTasks() {
  const { data, error, mutate } = useSWR<Task[]>("/api/tasks", fetcher, {
    refreshInterval: 10000,
  });

  const updateTask = async (id: number, updates: Partial<Task>) => {
    // Optimistic update
    mutate(
      (tasks) => tasks?.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      false,
    );

    try {
      await fetch("/api/tasks", {
        method: "PUT",
        body: JSON.stringify({ id, ...updates }),
      });
      mutate(); // Revalidate
    } catch {
      mutate(); // Rollback on error
    }
  };

  return { tasks: data, error, updateTask };
}
```

### Component Structure

```
components/
├── ui/
│   ├── button.tsx          # Base button component
│   ├── card.tsx            # Card container
│   ├── dialog.tsx          # Modal dialogs
│   ├── badge.tsx           # Status badges
│   ├── input.tsx           # Form inputs
│   ├── select.tsx          # Dropdown selects
│   ├── progress.tsx        # Progress bars
│   ├── skeleton.tsx        # Loading skeletons
│   ├── sonner.tsx          # Toast notifications
│   ├── kanban-board.tsx    # Drag-and-drop board
│   ├── work-notes.tsx      # Work notes panel
│   └── delete-button.tsx   # Confirmation delete
└── dashboard/
    └── Sidebar.tsx         # Navigation sidebar
```

### Styling

Tailwind CSS 4 with CSS variables for theming:

```css
/* src/app/globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  /* ... */
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... */
}
```

---

## Security Considerations

### Environment Variables

Sensitive configuration stored in `.env.local` (gitignored):

```bash
GITHUB_TOKEN=ghp_...      # Never commit
GITHUB_OWNER=username     # Safe to share
DATABASE_URL=./data/...   # Local path
```

### Database Security

- SQLite file permissions: owner read/write only
- No network exposure (local file)
- WAL mode prevents corruption from crashes

### API Security

- No authentication required (local-only design)
- CORS restricted to localhost
- Input validation on all endpoints

---

## Performance

### Database

- Connection pooling (5 connections)
- WAL mode for concurrent access
- Indexed columns: `status`, `project_id`, `github_issue_id`

### Frontend

- SWR caching with 10s refresh interval
- Optimistic updates for instant feedback
- Code splitting via Next.js App Router
- Static assets served from `/public`

### API

- Streaming responses where applicable
- Pagination for large result sets
- Rate limit awareness for GitHub API

---

## Deployment

### Development

```bash
bun run dev     # Port 5000, hot reload
```

### Production

```bash
bun run build   # Create optimized build
bun run start   # Serve production build
```

### As a Service (macOS)

Create a LaunchAgent plist:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.moltboard.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd /path/to/moltboard && bun run start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/path/to/moltboard</string>
</dict>
</plist>
```

Install:

```bash
cp com.moltboard.dashboard.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.moltboard.dashboard.plist
```

---

## Troubleshooting

### Database Locked

```bash
# Check for zombie processes
lsof data/tasks.db

# Force close connections
pkill -f "moltboard"
```

### GitHub Sync Failing

```bash
# Check rate limits
curl -H "Authorization: token $GITHUB_TOKEN" \
    https://api.github.com/rate_limit

# Verify token scopes
curl -H "Authorization: token $GITHUB_TOKEN" \
    https://api.github.com/user
```

### Port Already in Use

```bash
# Find process on port 5000
lsof -i :5000

# Kill it
kill -9 <PID>
```

---

## Monitoring

### Logs

- Development: Console output
- Production: `logs/dashboard.log`
- Cron workers: `/tmp/cron-worker.log`

### Health Checks

```bash
# API health
curl http://localhost:5000/api/status

# Database health
curl http://localhost:5000/api/status/database
```

### Metrics

Access `/api/metrics` for:

- Task completion history (7 days)
- Daily task counts
- Status distribution
