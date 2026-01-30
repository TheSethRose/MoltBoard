# MoltBoard Infrastructure

This document describes how MoltBoard is assembled, how data flows through the system, and how runtime services are operated on macOS.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                  MoltBoard                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────┐    ┌─────────────────────┐    ┌─────────────┐             │
│  │   Browser   │───▶│  Next.js App Router │───▶│   SQLite    │             │
│  │   (React)   │◀───│  UI + API Routes    │◀───│  Database   │             │
│  └─────────────┘    └─────────────────────┘    └─────────────┘             │
│          │                    │                         ▲                 │
│          │                    │                         │                 │
│          │                    ▼                         │                 │
│          │             ┌─────────────┐                  │                 │
│          │             │ GitHub API  │                  │                 │
│          │             │  (Octokit)  │                  │                 │
│          │             └─────────────┘                  │                 │
│          │                                               │                 │
│          │             ┌────────────────────┐            │                 │
│          └───────────▶ │ CLI + Cron Workers │────────────┘                 │
│                        │ (Bun scripts)      │                              │
│                        └────────────────────┘                              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1) Web Application (Next.js 16)

**Location:** `src/`

- App Router monolith: UI pages and API routes live in the same codebase.
- UI pages are grouped in `src/app/(dashboard)`.
- API routes are in `src/app/api`.
- React 19 + Tailwind CSS 4 + Radix UI primitives (components in `src/components/ui`).

```
src/
├── app/
│   ├── (dashboard)/          # Dashboard pages (tasks/projects/status)
│   ├── api/                  # REST API endpoints
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Landing redirect
├── components/
│   ├── ui/                   # UI primitives
│   └── dashboard/            # Dashboard layout (Sidebar)
├── lib/
│   ├── db.ts                 # SQLite connection pool
│   ├── github.ts             # GitHub API client
│   ├── workspace-path.ts     # Workspace path resolution
│   └── api-error-handler.ts  # API error wrapper
└── types/
    ├── task.ts
    └── project.ts
```

### 2) Database (SQLite)

**Location:** `<WORKSPACE>/data/tasks.db`

- Single data store using SQLite with WAL enabled for concurrency.
- JSON-backed fields stored as strings: `tags`, `blocked_by`, `work_notes`, `tech_stack`, `github_sync_settings`.
- Task statuses are validated via `src/lib/task-statuses.ts`.

#### Connection Pool

```typescript
// src/lib/db.ts
const POOL_SIZE = 5;
const pool: Database[] = [];

export function getDb(): Database {
  if (pool.length > 0) return pool.pop()!;
  const db = new Database(getDatabasePath());
  db.pragma("journal_mode = WAL");
  return db;
}

export function releaseDb(db: Database): void {
  if (pool.length < POOL_SIZE) pool.push(db);
  else db.close();
}
```

### 3) GitHub Integration

**Location:** `src/lib/github.ts`

- Uses Octokit with rate limit awareness.
- Sync workflow is triggered by `POST /api/projects/[id]/sync`.
- Tasks map to issues via `github_issue_id` and `github_issue_repo`.

### 4) Workspace Resolution

**Location:** `src/lib/workspace-path.ts`

Workspace path resolution order:

1. `MOLTBOT_WORKSPACE`
2. `WORKSPACE_DIR`
3. `~/.clawdbot/clawdbot.json` → `agents.defaults.workspace`
4. `~/.moltbot/moltbot.json` → `agents.defaults.workspace`
5. Fallback: `~/workspace`

---

## Runtime Services (macOS)

### Dashboard (LaunchAgent)

- The dashboard UI is typically run via a LaunchAgent plist (per-user).
- Runs the Next.js app in production mode (`bun run start`).

### Gateway (LaunchDaemon)

- The gateway service is typically run via a system LaunchDaemon (`com.clawdbot.gateway2`).
- Runs as the `agent` user for DB access isolation.
- Serves the same Next.js app on port **5278**.

### Cron Workers

- Scheduled scripts run from `skills/task-manager/scripts`.
- `recurring-work.js` is the primary task lifecycle worker.
- `project-sync-cron.js` triggers GitHub sync.

---

## Data Flow

### Task CRUD (UI)

```
User → UI Form → /api/tasks → SQLite → Response → SWR cache update
```

- UI uses SWR for data fetching with optimistic updates.
- API routes validate input and persist changes using the connection pool.

### Drag & Drop (Status Changes)

```
Drag → Optimistic UI → PUT /api/tasks → Persist → Confirm/Rollback
```

### GitHub Issue Sync

```
Cron → POST /api/projects/[id]/sync → GitHub API → Compare → SQLite
```

### Moltbot Assist (Research)

```
UI → /api/clawdbot/research → CLI/gateway tool → Response → Task fields
```

The Assist route assembles full task context and returns structured suggestions (title, tags, dependencies, priority, notes) for mapping into the task editor.

---

## API Layer

### Error Handling

All API routes use a unified error wrapper:

```typescript
import { withErrorHandling } from "@/lib/api-error-handler";

export const GET = withErrorHandling(async () => {
  // ...
});
```

### Validation

Routes validate inputs with explicit checks or schemas before DB operations.

---

## CLI + Automation

**Location:** `skills/task-manager/scripts/`

- `recurring-work.js` - Main task lifecycle worker.
- `project-sync-cron.js` - Calls the GitHub sync API.
- `add-work-note.js` - Appends timestamped work notes (do not write to `tasks.work_notes` directly).
- `db-tasks.js` - Direct task operations for CLI usage.

Cron entrypoint: `skills/task-manager/scripts/cron-worker.sh` (invokes backups + recurring work).

---

## Security & Permissions

- Local-only system; no public auth layer by default.
- Sensitive values in `.env.local` (gitignored).
- DB directory is owned by `agent` with mode `700` for isolation.
- Other users must access data through API routes or CLI scripts.

Access matrix:

| User       | DB Access    | Mechanism               |
| ---------- | ------------ | ----------------------- |
| `agent`    | Read + Write | Owns data directory     |
| `clawdbot` | None         | Permission denied       |
| Subagents  | API only     | API routes / CLI bridge |

---

## Operations

### Development

```bash
bun install
bun run dev
```

### Production

```bash
bun run build
bun run start
```

### Health Checks

```bash
curl http://localhost:5278/api/status
curl http://localhost:5278/api/status/database
```

---

## Monitoring

- Dashboard logs: `logs/dashboard.log` (production) or console output (dev).
- Cron logs: `/tmp/cron-worker.log`.
- Gateway logs: `/tmp/clawdbot-gateway.log` and `/tmp/clawdbot-gateway.err`.

---

## Troubleshooting

### Port Already in Use

```bash
lsof -i :5278
kill -9 <PID>
```

### Database Locked

```bash
lsof data/tasks.db
pkill -f "moltboard"
```

### GitHub Sync Failing

```bash
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/rate_limit
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```
