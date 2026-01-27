# MoltBoard

A local-first task and project management dashboard designed for AI-assisted development workflows. MoltBoard provides a web interface for managing tasks, tracking project progress, and integrating with GitHub—all backed by a lightweight SQLite database.

## What is MoltBoard?

MoltBoard is the companion dashboard for [MoltBot](https://github.com/YOUR_USERNAME/moltbot), an AI coding assistant. It serves as a central hub for:

- **Task Management** — Create, organize, and track tasks through their lifecycle (backlog → ready → in-progress → completed)
- **Project Tracking** — Manage multiple projects with workspace integration and tech stack documentation
- **GitHub Integration** — Import repositories, pull issues into your local task list, and track remote changes
- **System Monitoring** — View system health, memory usage, uptime, and task metrics
- **Work Notes** — Attach timestamped notes to tasks for context and progress tracking

MoltBoard is designed to run locally on your development machine, giving you full control over your data while providing a clean, modern interface for task management.

## Requirements

- **Bun** 1.0+ ([install](https://bun.sh))
- **GitHub Personal Access Token** (for GitHub integration features)
- **Clawdbot** (for automated task processing)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/moltboard.git
cd moltboard

# 2. Install dependencies
bun install

# 3. Set up environment
cp .env.example .env.local

# 4. Edit .env.local with your settings
#    - Add your GitHub token
#    - Set your GitHub username

# 5. Initialize the database
bun run migrate

# 6. Start the development server
bun run dev
```

Open **http://localhost:5000** in your browser.

## Configuration

### Environment Variables

Create a `.env.local` file (copy from `.env.example`):

```bash
# Required: GitHub Integration
GITHUB_TOKEN=ghp_your_personal_access_token_here
GITHUB_OWNER=your_github_username

# Optional: Defaults shown
DATABASE_URL=./data/tasks.db
NEXT_PUBLIC_APP_URL=http://localhost:5000
```

### GitHub Token Setup

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `read:user`
4. Copy the token to your `.env.local` file

### Workspace Configuration

MoltBoard reads your workspace path from the Clawdbot configuration file. If you have Clawdbot installed, this file should already exist:

```bash
# Check if config exists
cat ~/.clawdbot/clawdbot.json
```

The workspace path is read from `agents.defaults.workspace`:

```json
{
  "agents": {
    "defaults": {
      "workspace": "/path/to/your/workspace"
    }
  }
}
```

> **Note:** The config location may change to `~/.moltbot/moltbot.json` in future versions. MoltBoard will check both locations.

Alternatively, set the environment variable:
```bash
export MOLTBOT_WORKSPACE=/path/to/your/workspace
```

## Agent Task Processing

MoltBoard is designed to work with Clawdbot's cron system for automated task processing. When configured, the agent will:

1. Pick up tasks in **Ready** status
2. Work on them one at a time
3. Update status to **In Progress** while working
4. Mark as **Completed** or **Blocked** when done

### Setting Up the Cron Job

Use Clawdbot's cron system to schedule the task worker. See the [Clawdbot Cron Jobs documentation](https://docs.molt.bot/automation/cron-jobs#cron-jobs) for details.

```bash
# Add the task worker cron job (runs every 3 minutes)
clawdbot cron add "moltboard-worker" "*/3 * * * *" \
    "/path/to/moltboard/skills/task-manager/scripts/cron-worker.sh"

# Verify it's registered
clawdbot cron list
```

The cron worker will:
- Back up your workspace state
- Check for **Ready** tasks
- Process one task at a time
- Log progress to `~/workspace/logs/cron-worker.log`

## Features

### Task Management

Tasks flow through a simple lifecycle:

| Status | Icon | Description |
|--------|------|-------------|
| **Backlog** | `[~]` | Ideas and future work, not yet prioritized |
| **Ready** | `[ ]` | Actionable tasks, ready to start |
| **In Progress** | `[*]` | Currently being worked on |
| **Completed** | `[x]` | Finished tasks |
| **Blocked** | `[!]` | Waiting on dependencies or external factors |

Features include:
- Drag-and-drop reordering
- Task dependencies (blocked by other tasks)
- Priority levels (urgent, high, medium, low)
- Tags for categorization
- Work notes with timestamps

### Project Management

- Create and organize projects
- Link to local workspace directories
- Document tech stack and architecture
- Track project-level metrics

### GitHub Integration

- **Import Projects** — Create projects from GitHub repositories
- **Issue Sync** — Pull GitHub issues into your local task list (one-way sync)
- **Selective Import** — Choose which issues to track locally
- **Status Updates** — See commit history and branch status

### System Status

Monitor your development environment:
- System uptime and memory usage
- Database connection status
- Git repository state
- Task completion metrics over time

## Project Structure

```
moltboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Dashboard pages
│   │   │   ├── tasks/          # Task management UI
│   │   │   ├── projects/       # Project management UI
│   │   │   └── status/         # System status page
│   │   └── api/                # REST API endpoints
│   ├── components/             # React components
│   └── lib/                    # Utilities and database
├── scripts/
│   ├── migrations/             # SQL migration files
│   └── run-migrations.js       # Migration runner
├── skills/
│   └── task-manager/           # CLI tools and cron scripts
├── data/                       # SQLite database (gitignored)
└── public/                     # Static assets
```

## API Reference

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List all tasks |
| `POST` | `/api/tasks` | Create a new task |
| `PUT` | `/api/tasks` | Update a task |
| `PATCH` | `/api/tasks` | Reorder tasks |
| `DELETE` | `/api/tasks?id=N` | Delete a task |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a new project |
| `POST` | `/api/projects/import-github` | Import from GitHub |
| `GET` | `/api/projects/[id]` | Get project details |
| `POST` | `/api/projects/[id]/sync` | Sync GitHub issues |

### Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Full system status |
| `GET` | `/api/status/database` | Database health |
| `GET` | `/api/status/uptime` | System uptime |
| `GET` | `/api/metrics` | Task metrics history |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server on port 5000 |
| `bun run build` | Create production build |
| `bun run start` | Run production server |
| `bun run migrate` | Run database migrations |
| `bun run lint` | Run ESLint |
| `bun run type-check` | TypeScript type checking |

## Task Manager CLI

MoltBoard includes a command-line interface for task management:

```bash
# List tasks
bun skills/task-manager/scripts/db-tasks.js list

# Add a task
bun skills/task-manager/scripts/db-tasks.js add "Implement feature X" ready

# Complete a task
bun skills/task-manager/scripts/db-tasks.js complete "feature X"

# See task counts
bun skills/task-manager/scripts/db-tasks.js count
```

See `skills/task-manager/SKILL.md` for full CLI documentation.

## Background Workers

MoltBoard includes background workers for automation:

- **Backup Script** — Periodic workspace backup to git
- **Project Sync** — Automatic GitHub issue synchronization
- **Task Worker** — Picks up Ready tasks for agent processing

Set up using Clawdbot cron (recommended):
```bash
# Task worker (every 3 minutes)
clawdbot cron add "moltboard-worker" "*/3 * * * *" \
    "./skills/task-manager/scripts/cron-worker.sh"

# GitHub issue sync (every 15 minutes)
clawdbot cron add "moltboard-sync" "*/15 * * * *" \
    "bun ./skills/task-manager/scripts/project-sync-cron.js"
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Framework:** [Next.js 16](https://nextjs.org/) with App Router
- **UI:** [React 19](https://react.dev/) + [Tailwind CSS 4](https://tailwindcss.com/)
- **Components:** [Radix UI](https://www.radix-ui.com/) primitives
- **Database:** [SQLite](https://sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **GitHub API:** [@octokit/rest](https://github.com/octokit/rest.js)
- **Animations:** [Framer Motion](https://www.framer.com/motion/)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with Bun, Next.js, and SQLite for local-first task management.
