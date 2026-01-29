# Cron setup (Clawdbot)

This guide describes the current cron jobs stored in the Clawdbot gateway. The jobs run on the configured schedule and post summaries back to the main session.

## Prereqs

- Clawdbot gateway running as `agent` user via LaunchDaemon (see [Database Isolation](#database-isolation))
- `.env` populated (intervals + models)
- **Note:** Ensure `WORKER_*_MODEL` values are allowed by your gateway allowlist.
- Set `--thinking high` to match the current worker configuration.

## Sandboxing modes (Docker vs bare metal)

Clawdbot can run worker jobs in two modes. Pick one and align the config + cron session target:

- **Docker sandbox (recommended for isolation)**
  - Requires Docker available to Clawdbot.
  - Set `agents.defaults.sandbox.mode: "non-main"` in `~/.clawdbot/clawdbot.json`.
  - Use `sessionTarget: "isolated"` for `systemEvent` jobs.

- **Bare metal (no Docker)**
  - Runs jobs directly on the host.
  - Set `agents.defaults.sandbox.mode: "off"` in `~/.clawdbot/clawdbot.json`.
  - Use `sessionTarget: "main"` for `systemEvent` jobs.

## Session + payload rule

Each run executes in `cron:<jobId>` and posts a summary to the main session. Use the `sessionTarget` that matches your sandbox mode (see above).

**Important:** Jobs in `main` must use `payload.kind: "systemEvent"` and `wakeMode: "next-heartbeat"`.

## Intervals

The current schedule is every 10 minutes for worker jobs, every 3 minutes for `workspace-backup`, and every 30 minutes for `project-sync`.

## Jobs (current in gateway)

### Path configuration rule

All jobs use host paths (e.g., `/Users/clawdbot/workspace/...`). Replace `<WORKSPACE>` with your resolved workspace path.

All task mutations must go through the CLI scripts in the workspace (no direct sqlite access).

### workspace-backup

- Schedule: every 3m
- Session: main
- Status: enabled
- Target: next-heartbeat
- Message:

"Execute <WORKSPACE>/skills/task-manager/scripts/backup.sh exactly as written. This job exists only to create the backup and must not read or modify tasks, must not access project repositories, and must not run any other script or command. After the command finishes, exit. If the command fails for any reason, output the exact error and exit immediately without any retries or additional actions."

### project-sync

"Execute bun <WORKSPACE>/skills/task-manager/scripts/project-sync-cron.js. This job exists only to synchronize project metadata and GitHub issue configuration as defined by the script. Do not manually edit tasks or repositories outside of what the script performs. If any error occurs, report the exact error and exit immediately without running any other commands."

### Review Worker

"Execute bun <WORKSPACE>/skills/task-manager/scripts/review-worker.js. If a review-eligible task is returned, you MUST make a decision by executing exactly ONE of the two commands below - do not skip this step or exit early. Follow the printed REVIEW CHECKLIST: (1) run 'git status -sb' to list changed files, (2) run 'cat <filepath>' on EVERY changed file to read actual code, (3) run 'grep -n TODO <filepath>' and 'grep -n mock <filepath>' on each file, (4) verify the implementation is complete - not a stub. After inspection, execute ONE of these: If ANY file contains mock data, placeholder functions, TODO comments, or incomplete wiring: execute 'bun <WORKSPACE>/skills/task-manager/scripts/review-worker.js --request-changes <taskId> --summary \"<filepath:line evidence>\"'. If ALL deliverables are fully implemented with real code and no mocks: execute 'bun <WORKSPACE>/skills/task-manager/scripts/review-worker.js --approve <taskId> --summary \"<files checked and what was verified>\"'. You are NOT allowed to exit without executing --approve or --request-changes. If no eligible task, exit without changes."

### Backlog Groomer

"Execute bun <WORKSPACE>/skills/task-manager/scripts/backlog-groomer.js. This job is allowed to update task notes and task status only and must not modify any code, repository files, or configuration. Identify tasks in status backlog that lack clear scope, acceptance criteria, or an actionable plan. For each selected task, append a work note starting with 'groom:done: <concise plan and criteria>' using 'bun <WORKSPACE>/skills/task-manager/scripts/add-work-note.js --task-id <taskId> --author system --content \"groom:done: <concise plan and criteria>\"' and move the task to ready, or append 'groom:blocked: <reason>' plus 'status:blocked: <reason>' using 'bun <WORKSPACE>/skills/task-manager/scripts/add-work-note.js --task-id <taskId> --author system --content \"groom:blocked: <reason>\"' and 'bun <WORKSPACE>/skills/task-manager/scripts/add-work-note.js --task-id <taskId> --author system --content \"status:blocked: <reason>\"' and keep it blocked. Use <WORKSPACE>/skills/task-manager/scripts/add-work-note.js to add any additional details or context discovered during the grooming process that the next agents might need to complete the task. Do not change tasks outside the backlog status. If no eligible task, exit without changes."

### Coding Worker

Execute bun <WORKSPACE>/skills/task-manager/scripts/recurring-worker.js --auto. Do not directly update the database. Do not call the tasks API directly for work_notes - always use <WORKSPACE>/skills/task-manager/scripts/add-work-note.js to avoid wiping existing notes. If a task is selected, perform the work only in the task's project repository and do not touch unrelated repositories or files. Append progress notes to work_notes during execution using 'bun <WORKSPACE>/skills/task-manager/scripts/add-work-note.js --task-id <taskId> --author agent --content "<progress update>"'. Use <WORKSPACE>/skills/task-manager/scripts/add-work-note.js to describe which files were touched and what was implemented in each (describe the change and where, do not list code). When complete, run 'bun <WORKSPACE>/skills/task-manager/scripts/recurring-worker.js --complete-with-summary <taskId> --summary "<concise outcome and files changed>"'. If blocked, run 'bun <WORKSPACE>/skills/task-manager/scripts/recurring-worker.js --block <taskId> --reason "<blocking issue>" --activity "<next step>"'. Exit after the completion or block command runs. If no eligible task, exit without changes.

## Add or edit jobs

Use the same messages above when adding or editing jobs. Replace `<WORKSPACE>` with the path resolved by your workspace config (for example `/Users/clawdbot/workspace`). Example (edit):

```bash
clawdbot cron edit --id <jobId> --message "<paste message from above>"
```

## Verify

```bash
clawdbot cron list
clawdbot cron runs --id <jobId> --limit 20
```

## Database Isolation

The gateway runs as the `agent` user via a system LaunchDaemon. The database directory is owned by `agent` with mode `700`, preventing other users (including `clawdbot` and subagents) from accessing the database directly.

### Setup

1. **LaunchDaemon** at `/Library/LaunchDaemons/com.clawdbot.gateway2.plist`:
   - Runs as `UserName: agent`
   - Executes `bun run start` (production build)
   - Listens on port 5278

2. **Database permissions**:

   ```bash
   # Directory owned by agent, mode 700 (no access for others)
   sudo chown -R agent:staff /Users/clawdbot/clawdbot/data
   sudo chmod 700 /Users/clawdbot/clawdbot/data
   ```

3. **Access matrix**:
   | User | DB Access | Mechanism |
   |------|-----------|-----------|
   | `agent` | Read + Write | Owns data directory |
   | `clawdbot` | **None** | Permission denied |
   | Subagents | **API only** | Must use CLI scripts → API |

### Managing the daemon

```bash
# Start
sudo launchctl load /Library/LaunchDaemons/com.clawdbot.gateway2.plist

# Stop
sudo launchctl unload /Library/LaunchDaemons/com.clawdbot.gateway2.plist

# Restart (after code changes)
sudo launchctl unload /Library/LaunchDaemons/com.clawdbot.gateway2.plist
sudo launchctl load /Library/LaunchDaemons/com.clawdbot.gateway2.plist

# Check status
ps aux | grep "bun.*start"
curl -s http://localhost:5278/api/tasks | head -c 100
```

### CLI bridge

The scripts in `<WORKSPACE>/skills/task-manager/scripts` call the API to perform task mutations. Subagents use these scripts rather than accessing the database directly.

**Script status:**
| Script | API-first | Notes |
|--------|-----------|-------|
| `add-work-note.js` | ✅ | Uses API, falls back to direct DB |
| `recurring-worker.js` | ✅ | Uses API exclusively |
| `review-worker.js` | ✅ | Uses API exclusively |
| `backlog-groomer.js` | ✅ | Uses API exclusively |
| `complete-task.js` | ✅ | Uses API exclusively |

All scripts use `scripts/api-client.js` which auto-detects Docker vs host environment.

## Notes

- If you want delivery to a channel, add `--deliver` + `--channel` + `--to` to the cron add command.
- The `--wake now` flag ensures the job executes immediately upon being added; otherwise, it waits for the next heartbeat or scheduled interval.
