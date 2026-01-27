#!/bin/bash
# TASK WORKER EXECUTION LOOP
# Trigger: Cron (Every 3m)
# Executes: backup.sh -> Then runs recurring-work.js
#
# Crontab entry:
#   */3 * * * * /path/to/cron-worker.sh >> /tmp/cron-worker.log 2>&1
#
# Or with moltbot cron:
#   moltbot cron add "moltboard-worker" "*/3 * * * *" "./skills/task-manager/scripts/cron-worker.sh"

set -e

# Auto-detect script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure bun is in PATH for cron execution
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo ""
echo "========================================"
echo "MoltBoard Task Worker - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# ============================================================================
# PHASE 0: GLOBAL DATA RECOVERY (Safety Preamble)
# ============================================================================
echo ""
echo "[PHASE 0] Running backup.sh..."

# Run backup - continue regardless of success/failure
"$SCRIPT_DIR/backup.sh" || true

# ============================================================================
# PHASE 1: CONTEXT-AWARE EXECUTION (Project Logic)
# ============================================================================
echo ""
echo "[PHASE 1] Running recurring-work.js..."

# Run the task worker
bun "$SCRIPT_DIR/recurring-work.js"

echo ""
echo "MoltBoard Task Worker complete."
