# Draft: Beget VPS Production Deployment via Docker Compose

## Requirements (confirmed)
- Create a precise phased ULTRAWORK plan for production deployment on Beget VPS with Docker Compose.
- Output must be implementation-ready and include: milestones, file-level tasks, risk matrix, verification matrix, and exact command checklist.
- Use repository findings and standard Bun/Hono deployment practices; do not execute implementation or modify app code.
- Must include:
  - Target architecture: reverse proxy + app container + persistent volumes
  - Environment hardening
  - Dockerfile strategy
  - docker-compose services and healthchecks
  - SQLite WAL persistence, backup, restore strategy
  - Telegram webhook and restart behavior
  - Observability and log rotation
  - Security hardening
  - Rollout and rollback
  - Post-deploy smoke tests
- Must not include Kubernetes.
- Must avoid vague advice and unsupported assumptions.

## Technical Decisions
- Plan format will be one single work plan file under `.sisyphus/plans/`.
- Plan will assume current runtime entry point `bun run src/index.ts` in production container.
- Frontend will be treated as static artifact served behind reverse proxy (Nginx) with runtime API base injection strategy included in plan tasks.
- DB and uploads will be persisted as named volumes and mounted in app container.

## Research Findings
- No Docker artifacts currently present (`Dockerfile*`, `docker-compose*.yml/yaml` absent).
- Runtime entrypoint exists: `package.json:8` (`bun run src/index.ts`).
- Main app boot flow: `src/index.ts`:
  - Registers API routes under `/`
  - Exposes webhook route `/webhook/:secret`
  - Starts background jobs via `registerBackgroundJobs()`
  - Dev mode: long polling; production mode: webhook registration via `bot.api.setWebhook(...)`
- API CORS currently permissive (`origin: '*'`) in `src/api/index.ts`.
- Health endpoint exists: `src/api/routes/health.ts` (`GET /health` returns `{status:'ok',timestamp}`).
- SQLite schema enables WAL and FK: `src/db/schema.sql` PRAGMAs include `journal_mode=WAL` and `foreign_keys=ON`.
- Default DB path: `./data/lazyflow.db` in `src/env.ts` and `src/db/index.ts`.
- Uploads stored under `./uploads` (`src/api/routes/media.ts`), served privately with ownership checks via `/files/:mediaId` (`src/api/routes/files.ts`).
- Background jobs and media queue processor run in same process (`src/jobs/index.ts`).
- Frontend dev server is custom (`frontend/dev.ts`), and frontend API base currently from `window.LAZYFLOW_API_BASE_URL`.

## Scope Boundaries
- INCLUDE: Deployment infrastructure planning, containerization strategy, operations runbook.
- EXCLUDE: Actual implementation changes and code edits in this step.

## Open Questions
- None blocking for planning-level output; defaults will be explicitly disclosed in the generated plan.

## Latest User Direction
- Refine the plan into an immediate implementation sequence for Phase 1-2.
- Output must be concise, execution-ready, checklist-only.
- No code edits in this response; define exact file content goals and minimal-risk order.

## Latest User Direction (Caddy Swap)
- Need immediate micro-plan to replace Nginx reverse proxy with Caddy automatic TLS.
- Return concise file-level checklist and gotchas only.
- Context: compose currently has `app` + `reverse-proxy` (nginx); docs/scripts refer to nginx.
- Keep this planning-only (no implementation edits in response).
