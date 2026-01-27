#!/bin/bash
# PHASE 0: GLOBAL DATA RECOVERY (Safety Preamble)
# Target: ClawdVM-MacOS-Backup (Recovery Repo)
# Action: Capture entire ~/workspace state
# Trigger: Cron (every 3m) - runs BEFORE recurring-work.js
#
# Usage: backup.sh
#
# Environment variables (optional - auto-detected if not set):
#   RECOVERY_REPO - path to the recovery git repo
#   WORKSPACE_SOURCE - path to workspace to backup

set -e

# Auto-detect recovery repo: script location -> skills/task-manager/scripts -> repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECOVERY_REPO="${RECOVERY_REPO:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

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

WORKSPACE_SOURCE="${WORKSPACE_SOURCE:-$(get_workspace_dir)}"

cd "$RECOVERY_REPO" || { echo "Recovery repo not found at $RECOVERY_REPO"; exit 1; }

# Exclude projects with remote repos from backup; include local-only projects
EXCLUDE_FILE="$RECOVERY_REPO/.git/info/exclude"
touch "$EXCLUDE_FILE"

update_exclude() {
    local path="$1"
    local mode="$2"
    if [ "$mode" = "add" ]; then
        if ! grep -Fxq "$path" "$EXCLUDE_FILE"; then
            echo "$path" >> "$EXCLUDE_FILE"
        fi
    else
        if grep -Fxq "$path" "$EXCLUDE_FILE"; then
            local tmp
            tmp=$(mktemp)
            grep -Fxv "$path" "$EXCLUDE_FILE" > "$tmp"
            mv "$tmp" "$EXCLUDE_FILE"
        fi
    fi
}

PROJECTS_DIR="$WORKSPACE_SOURCE/projects"
if [ -d "$PROJECTS_DIR" ]; then
    for project in "$PROJECTS_DIR"/*; do
        [ -d "$project" ] || continue
        rel_path="projects/$(basename "$project")"
        if [ -d "$project/.git" ]; then
            remote=$(git -C "$project" config --get remote.origin.url 2>/dev/null || true)
            if [ -n "$remote" ]; then
                update_exclude "$rel_path" "add"
                git rm -r --cached -q "$rel_path" 2>/dev/null || true
                continue
            fi
        fi
        update_exclude "$rel_path" "remove"
    done
fi

# Backup database files together for consistency
if [ -f "$WORKSPACE_SOURCE/data/tasks.db" ]; then
    mkdir -p "$RECOVERY_REPO/data" 2>/dev/null || true
    cp "$WORKSPACE_SOURCE/data/tasks.db" "$RECOVERY_REPO/data/tasks.db.bak" 2>/dev/null || true
    if [ -f "$WORKSPACE_SOURCE/data/tasks.db-wal" ]; then
        cp "$WORKSPACE_SOURCE/data/tasks.db-wal" "$RECOVERY_REPO/data/tasks.db-wal.bak" 2>/dev/null || true
    fi
fi

# Check for changes
if git diff --quiet HEAD 2>/dev/null && git diff --cached --quiet 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "No changes to backup"
    exit 0
fi

# Build commit message from changes
added=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')
modified=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
staged=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')

# Get list of changed files for context
changed_files=$(git status --porcelain | head -5 | awk '{print $2}' | tr '\n' ', ' | sed 's/,$//')

# Generate descriptive commit message
timestamp=$(date '+%Y-%m-%d %H:%M')
msg="backup($timestamp): "

if [ "$added" -gt 0 ]; then
    msg="${msg}+${added} new "
fi
if [ "$modified" -gt 0 ]; then
    msg="${msg}~${modified} modified "
fi
if [ "$staged" -gt 0 ]; then
    msg="${msg}^${staged} staged "
fi

msg="${msg}| ${changed_files}"

# Stage all changes
git add -A

# Commit
git commit -m "$msg" --quiet

# Push (continue regardless of failure)
if git push origin main --quiet 2>&1; then
    echo "Backup complete: $msg"
else
    echo "Backup committed locally (push failed - will retry next cycle)"
fi

# Always exit 0 so recurring-work.js runs regardless
exit 0
