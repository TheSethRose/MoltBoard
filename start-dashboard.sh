#!/bin/bash
# MoltBoard Startup Script
# Run on login or manually

get_workspace_dir() {
    python3 - <<'PY'
import json
import os
from pathlib import Path

default = str(Path.home() / 'workspace')

# Check environment variables first
workspace = os.environ.get('MOLTBOT_WORKSPACE') or os.environ.get('WORKSPACE_DIR')
if workspace and workspace.strip():
    print(workspace.strip())
    raise SystemExit(0)

# Check config files (current: clawdbot, future: moltbot)
config_paths = [
    Path.home() / '.clawdbot' / 'clawdbot.json',
    Path.home() / '.moltbot' / 'moltbot.json',
]

for config in config_paths:
    try:
        if config.exists():
            data = json.loads(config.read_text())
            workspace = data.get('agents', {}).get('defaults', {}).get('workspace')
            if workspace and workspace.strip():
                print(workspace.strip())
                raise SystemExit(0)
    except Exception:
        continue

print(default)
PY
}

WORKSPACE_DIR="${WORKSPACE_DIR:-$(get_workspace_dir)}"

LOG_FILE="$WORKSPACE_DIR/logs/moltboard.log"
PID_FILE="$WORKSPACE_DIR/logs/moltboard.pid"
WORKER_LOG_FILE="$WORKSPACE_DIR/logs/moltboard-worker.log"
WORKER_PID_FILE="$WORKSPACE_DIR/logs/moltboard-worker.pid"
DB_PATH="${DB_PATH:-$HOME/clawdbot/data/tasks.db}"
export DATABASE_URL="$DB_PATH"
export MOLTBOT_DB_PATH="$DB_PATH"

start_dashboard() {
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo "MoltBoard already running (PID: $OLD_PID)"
            return 0
        else
            rm -f "$PID_FILE"
        fi
    fi

    cd "$WORKSPACE_DIR/moltboard"
    bun run dev >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "MoltBoard started (PID: $(cat $PID_FILE))"

    # Start background worker
    if [ -f "$WORKER_PID_FILE" ]; then
        OLD_WORKER_PID=$(cat "$WORKER_PID_FILE")
        if kill -0 "$OLD_WORKER_PID" 2>/dev/null; then
            echo "MoltBoard worker already running (PID: $OLD_WORKER_PID)"
            return 0
        else
            rm -f "$WORKER_PID_FILE"
        fi
    fi

    bun "$WORKSPACE_DIR/moltboard/scripts/recurring-work.js" >> "$WORKER_LOG_FILE" 2>&1 &
    echo $! > "$WORKER_PID_FILE"
    echo "MoltBoard worker started (PID: $(cat $WORKER_PID_FILE))"
}

stop_dashboard() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm -f "$PID_FILE"
            echo "MoltBoard stopped"
        else
            rm -f "$PID_FILE"
            echo "MoltBoard was not running"
        fi
    else
        echo "MoltBoard not running"
    fi

    if [ -f "$WORKER_PID_FILE" ]; then
        WORKER_PID=$(cat "$WORKER_PID_FILE")
        if kill -0 "$WORKER_PID" 2>/dev/null; then
            kill "$WORKER_PID"
            rm -f "$WORKER_PID_FILE"
            echo "MoltBoard worker stopped"
        else
            rm -f "$WORKER_PID_FILE"
            echo "MoltBoard worker was not running"
        fi
    else
        echo "MoltBoard worker not running"
    fi
}

status_dashboard() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "MoltBoard is running (PID: $PID)"
        else
            echo "MoltBoard is not running (stale PID file)"
        fi
    else
        echo "MoltBoard is not running"
    fi

    if [ -f "$WORKER_PID_FILE" ]; then
        WORKER_PID=$(cat "$WORKER_PID_FILE")
        if kill -0 "$WORKER_PID" 2>/dev/null; then
            echo "MoltBoard worker is running (PID: $WORKER_PID)"
        else
            echo "MoltBoard worker is not running (stale PID file)"
        fi
    else
        echo "MoltBoard worker is not running"
    fi
}

case "$1" in
    start)
        start_dashboard
        ;;
    stop)
        stop_dashboard
        ;;
    restart)
        stop_dashboard
        sleep 2
        start_dashboard
        ;;
    status)
        status_dashboard
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
