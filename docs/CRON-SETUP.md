# Cron setup (Clawdbot)

This guide configures dedicated worker sessions with model overrides so each worker runs in an isolated cron session.

## Prereqs

- Clawdbot gateway running
- `.env` populated (intervals + models)
- **Note:** Ensure `WORKER_*_MODEL` values are allowed by your gateway allowlist.
- Set `--thinking high` to match the current worker configuration.

## Session + model rule

Use **isolated** cron jobs with `agentTurn` payloads and `--model` overrides. Each run executes in `cron:<jobId>` and posts a summary to the main session.

## Intervals

The default schedule is every 3 minutes (matches `WORKER_*_INTERVAL` in `.env`).

## Commands

### Backlog Groomer (Worker 1)

```bash
clawdbot cron add \
  --name "Backlog Groomer" \
  --every "${WORKER_GROOM_INTERVAL:-3m}" \
  --session isolated \
  --message "Run bun ~/workspace/projects/moltboard/skills/task-manager/scripts/backlog-groomer.js. Find the first backlog task that meets criteria (no groom marker). If none, exit without changes." \
  --model "${WORKER_GROOM_MODEL}" \
  --post-prefix "Cron" \
  --thinking high \
  --wake now
```

### Coding Worker (Worker 2)

```bash
clawdbot cron add \
  --name "Coding Worker" \
  --every "${WORKER_CODE_INTERVAL:-3m}" \
  --session isolated \
  --message "Run bun ~/workspace/projects/moltboard/skills/task-manager/scripts/recurring-worker.js. Find the first ready task that meets criteria (dependencies satisfied, not blocked). If none, exit without changes." \
  --model "${WORKER_CODE_MODEL}" \
  --post-prefix "Cron" \
  --thinking high \
  --wake now
```

### Review Worker (Worker 3)

```bash
clawdbot cron add \
  --name "Review Worker" \
  --every "${WORKER_REVIEW_INTERVAL:-3m}" \
  --session isolated \
  --message "Run bun ~/workspace/projects/moltboard/skills/task-manager/scripts/review-worker.js. Find the first review task that meets criteria (no recent review note). If none, exit without changes." \
  --model "${WORKER_REVIEW_MODEL}" \
  --post-prefix "Cron" \
  --thinking high \
  --wake now
```

## Verify

```bash
clawdbot cron list
clawdbot cron runs --id <jobId> --limit 20
```

## Notes

- If you want delivery to a channel, add `--deliver` + `--channel` + `--to` to the cron add command.
- The `--wake now` flag ensures the job executes immediately upon being added; otherwise, it waits for the next heartbeat or scheduled interval.
