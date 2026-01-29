#!/bin/bash
# Dashboard startup script (legacy)
# Runs Next.js dev server on port 5278 in background
# Prefer launchctl via scripts/manage-launchctl.sh for production restarts.

cd "$(dirname "$0")"

# Kill existing process on port 5278
lsof -ti:5278 | xargs kill -9 2>/dev/null

# Start dev server
DB_PATH="${DB_PATH:-$HOME/clawdbot/data/tasks.db}"
export DATABASE_URL="$DB_PATH"
export MOLTBOT_DB_PATH="$DB_PATH"
bun run dev &

echo "Dashboard starting on http://localhost:5278"
echo "PID: $!"
