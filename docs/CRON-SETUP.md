# Cron setup (Clawdbot)

This guide describes the current cron jobs stored in the Clawdbot gateway. The jobs run on the configured schedule and post summaries back to the main session.

## Prereqs

- Clawdbot gateway running
- `.env` populated (intervals + models)
- **Note:** Ensure `WORKER_*_MODEL` values are allowed by your gateway allowlist.
- Set `--thinking high` to match the current worker configuration.

## Session + model rule

Use **isolated** cron jobs for all workers except `workspace-backup` (which runs in `main`). Each run executes in `cron:<jobId>` and posts a summary to the main session.

## Intervals

The current schedule is every 10 minutes for worker jobs, every 3 minutes for `workspace-backup`, and every 30 minutes for `project-sync`.

## Jobs (current in gateway)
### workspace-backup

- Schedule: every 3m
- Session: main
- Status: enabled
- Target: next-heartbeat
- Message:

"Execute ~/workspace/skills/task-manager/scripts/backup.sh exactly as written. This job exists only to create the backup and must not read or modify tasks, must not access project repositories, and must not run any other script or command. After the command finishes, exit. If the command fails for any reason, output the exact error and exit immediately without any retries or additional actions."

### project-sync

- Schedule: every 30m
- Session: isolated
- Status: enabled
- Target: next-heartbeat
- Message:

"Execute bun /Users/clawdbot/workspace/projects/moltboard/skills/task-manager/scripts/project-sync-cron.js. This job exists only to synchronize project metadata and GitHub issue configuration as defined by the script. Do not manually edit tasks or repositories outside of what the script performs. If any error occurs, report the exact error and exit immediately without running any other commands."

### Review Worker

- Schedule: every 10m
- Session: isolated
- Status: enabled
- Target: next-heartbeat
- Message:

"Execute bun /Users/clawdbot/workspace/projects/moltboard/skills/task-manager/scripts/review-worker.js. If a review-eligible task is returned, inspect work_notes, repository changes, and acceptance criteria to determine whether the task is complete and correct. Execute 'bun review-worker.js --approve <taskId> --summary \"<why it meets criteria and what was verified>\"' if it passes, or execute 'bun review-worker.js --request-changes <taskId> --summary \"<what failed, evidence, and required fixes>\"' if it fails. After approving or requesting changes, append a review activity note using 'bun add-work-note.js --task-id <taskId> --author system --content \"activity: review completed; decision recorded\"'. Exit after recording the review result. If no eligible task, exit without changes."

### Backlog Groomer

- Schedule: every 10m
- Session: isolated
- Status: enabled
- Target: now
- Message:

"Execute bun /Users/clawdbot/workspace/projects/moltboard/skills/task-manager/scripts/backlog-groomer.js. This job is allowed to update task notes and task status only and must not modify any code, repository files, or configuration. Identify tasks in status backlog that lack clear scope, acceptance criteria, or an actionable plan. For each selected task, append a work note starting with 'groom:done: <concise plan and criteria>' using 'bun add-work-note.js --task-id <taskId> --author system --content \"groom:done: <concise plan and criteria>\"' and move the task to ready, or append 'groom:blocked: <reason>' plus 'status:blocked: <reason>' using 'bun add-work-note.js --task-id <taskId> --author system --content \"groom:blocked: <reason>\"' and 'bun add-work-note.js --task-id <taskId> --author system --content \"status:blocked: <reason>\"' and keep it blocked. Use add-work-note.js to add any additional details or context discovered during the grooming process that the next agents might need to complete the task. Do not change tasks outside the backlog status. If no eligible task, exit without changes."

### Coding Worker

- Schedule: every 10m
- Session: isolated
- Status: enabled
- Target: next-heartbeat
- Message:

"Execute bun /Users/clawdbot/workspace/projects/moltboard/skills/task-manager/scripts/recurring-worker.js. Do not directly update the database. If a task is selected, perform the work only in the task's project repository and do not touch unrelated repositories or files. Append progress notes to work_notes during execution using 'bun add-work-note.js --task-id <taskId> --author agent --content \"<progress update>\"'. Use add-work-note.js to describe which files were touched and what was implemented in each (describe the change and where, do not list code). When complete, run 'bun recurring-worker.js --complete-with-summary <taskId> --summary \"<concise outcome and files changed>\"'. If blocked, run 'bun recurring-worker.js --block <taskId> --reason \"<blocking issue>\" --activity \"<next step>\"'. Exit after the completion or block command runs. If no eligible task, exit without changes."

## Add or edit jobs

Use the same messages above when adding or editing jobs. Example (edit):

```bash
clawdbot cron edit --id <jobId> --message "<paste message from above>"
```

## Verify

```bash
clawdbot cron list
clawdbot cron runs --id <jobId> --limit 20
```

## Notes

- If you want delivery to a channel, add `--deliver` + `--channel` + `--to` to the cron add command.
- The `--wake now` flag ensures the job executes immediately upon being added; otherwise, it waits for the next heartbeat or scheduled interval.
