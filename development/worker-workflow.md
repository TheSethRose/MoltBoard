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

**Idempotency**
- Skip tasks with `groom:done` work note.

### Worker 2 — Coder (Opus 4.5)

**Scope**
- Pull from `ready`.
- Execute implementation steps.
- Move to `review`.

**Idempotency**
- Skip tasks already in `review` or `completed`.

### Worker 3 — Reviewer (GPT-5.2 Codex)

**Scope**
- Pull from `review`.
- Review changes and add feedback.
- Add work note: `review:done`.
- Move to `completed`.

**Idempotency**
- Skip tasks with `review:done` work note.

## Notes

- This requires adding the `review` status across types, UI, and worker logic.
- Env config should allow status lists and defaults (see `.env.example`).
