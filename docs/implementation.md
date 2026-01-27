# MoltBoard Implementation Guide

## Overview

MoltBoard is a task and project management dashboard built with Bun, Next.js, React, and SQLite. This document outlines the migration from the original codebase to a clean, shareable release.

---

## Migration Status: COMPLETE

### Changes Made

1. **Security Cleanup**
   - [x] Removed `.env` file with credentials
   - [x] Removed `.claude/` settings directory
   - [x] Removed debug files (`test_logic.js`, `reproduce_bug.ts`)
   - [x] Removed personal notes (`work_notes.txt`)
   - [x] Removed user-specific plist file
   - [x] Updated `.gitignore` to exclude sensitive files

2. **Branding Updates**
   - [x] Renamed "Clawdbot" → "MoltBot" throughout
   - [x] Updated sidebar title to "MoltBoard"
   - [x] Updated README with MoltBoard branding
   - [x] Updated SKILL.md documentation

3. **Runtime Migration**
   - [x] Converted from Node.js/npm to Bun
   - [x] Updated all scripts and documentation

4. **Path Generalization**
   - [x] Checks `~/.clawdbot/clawdbot.json` (current)
   - [x] Checks `~/.moltbot/moltbot.json` (future)
   - [x] Environment variable: `MOLTBOT_WORKSPACE`
   - [x] Workspace detection falls back to `~/workspace`

5. **Files Updated**
   - `start-dashboard.sh` - Bun runtime, dual config checking
   - `src/lib/workspace-path.ts` - Dual config file support
   - `src/app/api/status/route.ts` - MoltBot CLI commands
   - `src/app/(dashboard)/status/page.tsx` - Interface updates
   - `src/components/dashboard/Sidebar.tsx` - MoltBoard title
   - `skills/task-manager/scripts/backup.sh` - Dual config checking
   - `skills/task-manager/scripts/cron-worker.sh` - Bun runtime
   - `skills/task-manager/SKILL.md` - Documentation updates

---

## Configuration

### Workspace Configuration

MoltBoard checks for workspace configuration in this order:

1. `MOLTBOT_WORKSPACE` environment variable
2. `WORKSPACE_DIR` environment variable
3. `~/.clawdbot/clawdbot.json` (current Clawdbot installation)
4. `~/.moltbot/moltbot.json` (future location)
5. Default: `~/workspace`

The config file structure:

```json
{
  "agents": {
    "defaults": {
      "workspace": "/path/to/your/workspace"
    }
  }
}
```

### Environment Variables

| Variable              | Required | Default                 | Description                  |
| --------------------- | -------- | ----------------------- | ---------------------------- |
| `GITHUB_TOKEN`        | Yes      | -                       | GitHub Personal Access Token |
| `GITHUB_OWNER`        | Yes      | -                       | GitHub username or org       |
| `GITHUB_REPO`         | No       | -                       | Default repository name      |
| `DATABASE_URL`        | No       | `./data/tasks.db`       | SQLite database path         |
| `NEXT_PUBLIC_APP_URL` | No       | `http://localhost:5000` | Application URL              |
| `MOLTBOT_WORKSPACE`   | No       | `~/workspace`           | Workspace directory          |

---

## Directory Structure

```
moltboard/
├── src/                    # Next.js application
│   ├── app/                # App router pages & API
│   ├── components/         # React components
│   ├── lib/                # Utilities
│   └── types/              # TypeScript types
├── public/                 # Static assets
├── scripts/
│   ├── migrations/         # SQL migration files
│   ├── run-migrations.js   # Migration runner
│   └── recurring-work.js   # Background worker
├── skills/
│   └── task-manager/       # Task management skill
│       ├── scripts/        # CLI and cron scripts
│       ├── SKILL.md        # Skill documentation
│       └── types.ts        # Type definitions
├── data/                   # Database directory
│   └── .gitkeep
├── logs/                   # Log files directory
│   └── .gitkeep
├── docs/
│   ├── implementation.md   # This file
│   └── INFRASTRUCTURE.md   # Technical architecture
├── .env.example            # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── README.md
└── start-dashboard.sh      # Startup script
```

---

## Setup Instructions

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/moltboard.git
cd moltboard

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your GitHub token

# 4. Run database migrations
bun run migrate

# 5. Start development server
bun run dev

# 6. Open in browser
open http://localhost:5000
```

---

## Cron Job Setup

Set up automated task processing using MoltBot cron:

```bash
# Task worker (every 3 minutes)
moltbot cron add "moltboard-worker" "*/3 * * * *" \
    "/path/to/moltboard/skills/task-manager/scripts/cron-worker.sh"

# GitHub issue sync (every 15 minutes)
moltbot cron add "moltboard-sync" "*/15 * * * *" \
    "bun /path/to/moltboard/skills/task-manager/scripts/project-sync-cron.js"
```

See [MoltBot Cron Jobs documentation](https://docs.molt.bot/automation/cron-jobs#cron-jobs) for details.

---

## Post-Setup Checklist

- [ ] Create GitHub Personal Access Token with `repo` and `read:user` scopes
- [ ] Configure `.env.local` with your credentials
- [ ] Verify `~/.clawdbot/clawdbot.json` or `~/.moltbot/moltbot.json` exists with workspace path
- [ ] Run `bun run migrate` to initialize database
- [ ] Set up MoltBot cron jobs for task processing
- [ ] Test all features work correctly
