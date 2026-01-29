# AGENTS.md

This file provides guidance to AI agents (Claude Code, Copilot, etc.) when working with code in this repository.


## Big Picture

- **Next.js 16 App Router monolith**: UI pages in `src/app/(dashboard)` and API routes in `src/app/api`.
- **SQLite** is the single data store; DB access via `src/lib/db.ts` with a connection pool and WAL mode.
- **GitHub issue sync** flows through API routes and `src/lib/github.ts` (Octokit); tasks map to issues via `github_issue_id`.

## Commands

```bash
# Start development server (port 5278)
bun run dev

# Type checking
bun run type-check

# Linting with auto-fix
bun run lint

# Run database migrations
bun run migrate

# Build for production
bun run build

# Start production server
bun run start

# Full clean check (type-check + lint + prettier)
bun run clean
```

## Tech Stack

- **Runtime**: Bun 1.0+
- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + Tailwind CSS 4 + Radix UI primitives
- **Database**: SQLite with `better-sqlite3` and custom connection pooling
- **Data Fetching**: SWR
- **Animations**: Framer Motion
- **GitHub API**: Octokit

## Key Data Flows

- **Task CRUD**: UI → `/api/tasks` → SQLite → SWR revalidate (see `src/app/(dashboard)/tasks` + `src/app/api/tasks`).
- **Drag/drop status change**: Uses optimistic updates in client hook, then `PUT /api/tasks`.
- **GitHub sync**: `POST /api/projects/[id]/sync` updates tasks and project `last_synced_at`.

## Architecture

### Database Layer (`src/lib/db.ts`)

Uses a custom connection pool (5 connections) with mutex protection. Always use `getDb()`/`releaseDb()` pattern in API routes to properly manage connections.

### API Routes Pattern

All API routes use the `withErrorHandling` wrapper from `@/lib/api-error-handler` which provides consistent error handling. Routes are located in `src/app/api/`.

Example structure:

```typescript
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  badRequest,
  notFound,
} from "@/lib/api-error-handler";

export const GET = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    const db = await getDb();
    // ... query db ...
    await releaseDb(db);
    return NextResponse.json({ data });
  },
  { context: { route: "/api/...", method: "GET" } },
);
```

### Migration System

Migrations are SQL files in `scripts/migrations/` applied by `scripts/run-migrations.js`. Applied migrations are tracked in the `_migrations` table. The migration runner handles duplicate column errors gracefully for `ALTER TABLE` operations.

## Project-Specific Conventions

- **Work notes**: Do **not** write to `tasks.work_notes` directly; use `skills/task-manager/scripts/add-work-note.js`.
- **Workspace path**: Resolution is centralized in `src/lib/workspace-path.ts` (env vars first, then `~/.clawdbot/clawdbot.json` / `~/.moltbot/moltbot.json`).
- **Tag colors**: Defined in `src/app/api/tasks/route.ts` as `TAG_COLORS`.

### Task Statuses

Statuses are defined in `src/lib/task-statuses.ts`: `backlog`, `ready`, `in_progress`, `completed`, `blocked`. Use `isValidTaskStatus()` and `getDefaultTaskStatus()` for validation.

### Key Conventions

- Work notes require timestamp when marking tasks complete
- Tasks auto-unblock when dependencies are completed
- Kanban uses `sort_order` column with 10-point increments for reordering
- All JSON columns (tags, blocked_by, work_notes) stored as JSON strings

## Background Workers & Automation

Cron scripts in `skills/task-manager/scripts` drive task lifecycle and GitHub sync:

- `skills/task-manager/scripts/recurring-work.js` - Main task lifecycle worker
- `project-sync-cron.js` - Calls the sync API

## External Integrations

- **GitHub API** via Octokit; requires `GITHUB_TOKEN` + `GITHUB_OWNER` in `.env.local`.
- **SQLite file** lives in `data/tasks.db` (gitignored).

## Where to Look First

- Tasks UI + state: `src/app/(dashboard)/tasks` and `src/lib/use-tasks.ts`
- API routes: `src/app/api/tasks`, `src/app/api/projects`, `src/app/api/status`
- DB schema and fields: `docs/DATABASE.md`
- Architecture and data flow: `docs/INFRASTRUCTURE.md`
