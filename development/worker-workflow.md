# Worker Workflow (Proposed)

This document captures the multi-worker task lifecycle so we can implement it once the configuration issue is done.

## Goals

- Separate responsibilities by worker/model.
- Avoid repeated processing via explicit markers.
- Keep a clear, deterministic state machine.

## Proposed Statuses

- backlog
- ready
- in-progress
- pending
- review
- blocked
- completed

## Workers

### Worker 1 — Backlog Groomer (Minimax M2.1)

**Scope**

- Pull from `backlog`.
- Improve definitions and add any research notes.
- Add work note: `groom:done`.
- Move to `ready`.
- If too vague, add `activity:` note and move to `blocked`.

**Script**

- `skills/task-manager/scripts/backlog-groomer.js`

**Commands**

- Mark ready:
  - `node scripts/backlog-groomer.js --mark-ready <taskId> --summary "..." --notes "..."`
- Block:
  - `node scripts/backlog-groomer.js --mark-blocked <taskId> --reason "..." --activity "..."`

**Idempotency**

- Skip tasks with `groom:done` work note.

### Worker 2 — Coder (Opus 4.5)

**Scope**

- Pull from `ready`.
- Execute implementation steps.
- Move to `review` (if configured) or `completed`.
- If conflicting instructions, add `activity:` note and move to `blocked`.
- If review fails, pick up again from `ready`.

**Script**

- `skills/task-manager/scripts/recurring-worker.js`

**Commands**

- Complete (moves to review when configured):
  - `node scripts/recurring-worker.js --complete-with-summary <taskId> --summary "..."`
- Force move to review:
  - `node scripts/recurring-worker.js --complete-for-review <taskId> --summary "..."`
- Block:
  - `node scripts/recurring-worker.js --block <taskId> --reason "..." --activity "..."`

**Idempotency**

- Skip tasks already in `review` or `completed`.

### Worker 3 — Reviewer (GPT-5.2 Codex)

**Scope**

- Pull from `review`.
- Review changes and add feedback.
- Verify the implementation is real (no mocks/placeholders unless explicitly required).
- Confirm acceptance criteria and end-to-end wiring are met.
- Add work note: `review:done`.
- Record an activity note with the review decision.
- If failed, add `review:failed` note and move back to `ready`.
- Skip if a recent review note exists.

**Script**

- `skills/task-manager/scripts/review-worker.js`

**Commands**

- Approve:
  - `node scripts/review-worker.js --approve <taskId> --summary "..."`
- Request changes:
  - `node scripts/review-worker.js --request-changes <taskId> --summary "..."`

**Idempotency**

- Skip tasks with `review:done` work note.

## Notes

- This requires adding the `review` status across types, UI, and worker logic.
- Env config should allow status lists and defaults (see `.env.example`).
- Review cooldown can be set via `REVIEW_COOLDOWN_MINUTES` (default: 60).
- Cron setup instructions live in `development/cron-setup.md`.
