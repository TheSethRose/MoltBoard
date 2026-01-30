#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

set +u
if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi
if [[ -f "$REPO_ROOT/.env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env.local"
    set +a
fi
set -u

ACTION=${2:-}
TARGET=${1:-}

if [[ -z "$TARGET" || -z "$ACTION" ]]; then
    echo "Usage: $0 {dashboard|gateway} {start|stop|restart|status}"
    exit 1
fi

find_dashboard_plist() {
    local override_name=${MOLTBOT_DASHBOARD_PLIST:-}
    local plist_name=""

    if [[ -n "$override_name" ]]; then
        plist_name="$override_name"
    elif [[ -f "$HOME/Library/LaunchAgents/com.moltbot.dashboard.plist" ]]; then
        plist_name="com.moltbot.dashboard.plist"
    else
        local match
        match=$(ls "$HOME/Library/LaunchAgents"/com.moltbot.dashboard*.plist 2>/dev/null | head -n 1 || true)
        if [[ -n "$match" ]]; then
            plist_name=$(basename "$match")
        fi
    fi

    if [[ -z "$plist_name" ]]; then
        echo "No dashboard plist found in $HOME/Library/LaunchAgents"
        exit 1
    fi

    echo "$HOME/Library/LaunchAgents/$plist_name"
}

manage_dashboard() {
    local action=$1
    local plist_path
    plist_path=$(find_dashboard_plist)

    local label
    label=$(/usr/bin/plutil -p "$plist_path" | /usr/bin/awk -F '=> ' '/"Label"/ {gsub(/[" ]/,"",$2); print $2; exit}')
    local service="gui/$(id -u)/$label"

    rebuild_dashboard() {
        sudo rm -rf "$REPO_ROOT/.next"
        sudo -u agent -H bash -lc "cd \"$REPO_ROOT\" && bun run build"
    }

    # Force-kill the dashboard process (runs as agent, so kickstart won't work)
    kill_dashboard_process() {
        local pid
        pid=$(pgrep -f "next start -p 5278" | head -n 1 || true)
        if [[ -n "$pid" ]]; then
            echo "Killing dashboard process (PID: $pid)..."
            sudo kill "$pid" 2>/dev/null || true
            sleep 2
        fi
    }

    case "$action" in
        start)
            launchctl bootstrap "gui/$(id -u)" "$plist_path"
            ;;
        stop)
            launchctl bootout "gui/$(id -u)" "$plist_path" 2>/dev/null || true
            ;;
        restart)
            kill_dashboard_process
            ;;
        rebuild)
            rebuild_dashboard
            ;;
        rebuild-restart)
            rebuild_dashboard
            kill_dashboard_process
            ;;
        status)
            launchctl print "gui/$(id -u)" 2>/dev/null | grep -F "$(basename "$plist_path" .plist)" || true
            ;;
        *)
            echo "Unknown action: $action"
            exit 1
            ;;
    esac
}

manage_gateway() {
    local action=$1
    local plist_path=${MOLTBOT_GATEWAY_PLIST:-/Library/LaunchDaemons/com.clawdbot.gateway2.plist}

    case "$action" in
        start)
            sudo launchctl load "$plist_path"
            ;;
        stop)
            sudo launchctl unload "$plist_path"
            ;;
        restart)
            sudo launchctl unload "$plist_path"
            sudo launchctl load "$plist_path"
            ;;
        status)
            sudo launchctl print system 2>/dev/null | grep -F "$(basename "$plist_path" .plist)" || true
            ;;
        *)
            echo "Unknown action: $action"
            exit 1
            ;;
    esac
}

case "$TARGET" in
    dashboard)
        manage_dashboard "$ACTION" "$@"
        ;;
    gateway)
        manage_gateway "$ACTION"
        ;;
    *)
        echo "Unknown target: $TARGET"
        exit 1
        ;;
esac
