# MoltBoard AI coding guide

## Big picture

- Next.js 16 App Router monolith: UI pages in `src/app/(dashboard)` and API routes in `src/app/api`.
- SQLite (bun:sqlite) is the single data store; DB access via `src/lib/db.ts` with a small connection pool and WAL mode.
- GitHub issue sync flows through API routes and `src/lib/github.ts` (Octokit); tasks map to issues via `github_issue_id`.

## Key data flows (examples)

- Task CRUD: UI → `/api/tasks` → SQLite → SWR revalidate (see `src/app/(dashboard)/tasks` + `src/app/api/tasks`).
- Drag/drop status change uses optimistic updates in the client hook and then `PUT /api/tasks`.
- GitHub sync: `POST /api/projects/[id]/sync` updates tasks and project `last_synced_at`.

## Dev workflows (Bun)

- Install: `bun install`
- Migrate DB: `bun run migrate` (runs `scripts/run-migrations.js` + `scripts/migrations/*.sql`).
- Dev server: `bun run dev` (default port 5000).
- Lint/type-check: `bun run lint`, `bun run type-check`.

## Project-specific conventions

- Task notes: do **not** write to `tasks.work_notes` directly; use `skills/task-manager/scripts/add-work-note.js`.
- Workspace path resolution is centralized in `src/lib/workspace-path.ts` (env vars first, then `~/.clawdbot/clawdbot.json` / `~/.moltbot/moltbot.json`).
- API error handling is wrapped with `src/lib/api-error-handler.ts`.
- UI primitives live in `src/components/ui` (Radix + Tailwind); dashboard layout in `src/components/dashboard/Sidebar.tsx`.

## Background workers & automation

- Cron scripts in `skills/task-manager/scripts` drive task lifecycle and GitHub sync (see `docs/CRON-SETUP.md`).
- `skills/task-manager/scripts/recurring-work.js` is the main task lifecycle worker; `project-sync-cron.js` calls the sync API.

## External integrations

- GitHub API via Octokit; requires `GITHUB_TOKEN` + `GITHUB_OWNER` in `.env.local`.
- SQLite file lives in `data/tasks.db` (gitignored).

## Where to look first

- Tasks UI + state: `src/app/(dashboard)/tasks` and `src/lib/use-tasks.ts`.
- API routes: `src/app/api/tasks`, `src/app/api/projects`, `src/app/api/status`.
- DB schema and fields: `docs/DATABASE.md`.
- Architecture and data flow: `docs/INFRASTRUCTURE.md`.
