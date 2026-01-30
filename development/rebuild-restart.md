# Rebuild + Relaunch (Dashboard + Gateway)

This document explains how to rebuild and relaunch both the dashboard and the Moltbot/Clawdbot gateway.

## Prereqs

- You have sudo access.
- The gateway runs as `agent` via `/Library/LaunchDaemons/com.clawdbot.gateway2.plist`.
- The dashboard runs as a LaunchAgent from `/Users/clawdbot/Library/LaunchAgents/com.moltbot.dashboard.plist`.

## Rebuild (run as `agent`)

The Next.js build must be performed as the `agent` user so it can read the database.

1. Rebuild (handles sudo + agent user):

- `bun run dashboard:rebuild`

## Relaunch dashboard (LaunchAgent)

1. Restart the dashboard LaunchAgent:

- `bun run dashboard:restart`

## Relaunch gateway (LaunchDaemon)

1. Restart the gateway LaunchDaemon:

- `bun run gateway:restart`

## Quick verification

- Dashboard process:
  - `pgrep -fl "next start -p 5278"`
- API health:
  - `curl -s http://localhost:5278/api/status | head -c 200`

## Notes

- The dashboard process runs under `agent`, so it reads `/Users/agent/.clawdbot/clawdbot.json`.
- If you changed API routes, always rebuild + restart the dashboard.
- The gateway is separate from the dashboard; restart it only if gateway config/env changed.
