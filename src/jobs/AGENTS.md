# Background Jobs — AGENTS.md

## OVERVIEW
Automated maintenance and resurfacing engines. Located in `src/jobs/`.

## ENGINES
- **Sunset**: Archives stale `active` tasks.
  - Criteria: `status = 'active'`, `is_idea = 0`, `deadline IS NULL`.
  - Timing: `last_interaction_at < 30 days` AND `updated_at < 1 hour`.
- **Mixer**: Resurfaces `backlog` tasks to `inbox`.
  - Limit: 5 random tasks per user.
  - Timing: Runs once per 24h per user (`last_mixer_run < 1 day`).
  - Candidate: `status = 'backlog'`, `last_seen_at < 14 days`.
- **Cleanup**: Purges old deleted tasks and orphan files from `uploads/`.

## PATTERNS
- **Idempotency**: Jobs use `last_run` timestamps or unique constraints to avoid duplicate execution.
- **Transactions**: Every job run is wrapped in a DB transaction.

## WHERE TO LOOK
- `sunset.ts`: Archiving logic.
- `mixer.ts`: Resurfacing logic.
- `index.ts`: Job orchestration and cron-like scheduling.
