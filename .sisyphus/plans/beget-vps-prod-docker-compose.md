# ULTRAWORK Plan: Production Deployment on Beget VPS (Docker Compose)

## Context

### User Request Summary
Prepare this repository for production deployment on a Beget VPS using Docker Compose, with an implementation-ready phased plan that includes architecture, hardening, data durability, rollout/rollback, and smoke tests.

### Repo Findings (validated)
- No containerization artifacts yet (`Dockerfile*`, `docker-compose*.yml/yaml` absent).
- Runtime entrypoint is Bun server: `package.json` script `start` -> `bun run src/index.ts`.
- App bootstrap at `src/index.ts`:
  - Registers API at `/`
  - Webhook endpoint `/webhook/:secret`
  - Runs `registerBackgroundJobs()` in same process
  - Dev: long polling; Prod: webhook registration (`bot.api.setWebhook`)
- API CORS is currently permissive (`origin: '*'`) in `src/api/index.ts`.
- Health endpoint exists (`GET /health`) in `src/api/routes/health.ts`.
- SQLite uses WAL and foreign keys in `src/db/schema.sql`.
- DB path defaults to `./data/lazyflow.db` (`src/env.ts`, `src/db/index.ts`).
- Uploads are stored under `./uploads` and served privately via authenticated `/files/:mediaId` ownership checks (`src/api/routes/media.ts`, `src/api/routes/files.ts`).
- Frontend currently has custom dev server (`frontend/dev.ts`) and API base via `window.LAZYFLOW_API_BASE_URL` (`frontend/index.html`, `frontend/src/api/client.ts`).

### Scope Boundaries
- IN: Docker/Compose productionization plan, file-level changes, operational runbook, risk and verification matrices, exact command checklist.
- OUT: Kubernetes, direct implementation in this step, app feature changes unrelated to deployment.

### Assumptions (explicit)
- VPS can run Docker Engine + Compose plugin.
- Public HTTPS domain will point to VPS (required for Telegram webhook).
- Existing app behavior must stay unchanged (no business-logic refactor).

### Metis Gap Analysis (applied)
- Gap addressed: frontend production artifact generation is not currently reproducible from scripts.
- Gap addressed: WAL backup/restore must preserve consistency during active writes.
- Gap addressed: webhook reliability must account for container restart and idempotency.
- Gap addressed: wildcard CORS is unsafe for production and requires explicit allowlist plan.
- Gap addressed: uploads must never be exposed as static web root.

## Target Architecture

```text
Internet (HTTPS)
  -> Nginx reverse-proxy container
      - serves Mini App static bundle
      - proxies /health, /me, /tasks, /folders, /files, /media, /google, /webhook/* to app:3000
  -> lazyflow-app container (Bun)
      - Hono API + grammY bot + background jobs in one process
      - DB at /app/data/lazyflow.db (WAL)
      - uploads at /app/uploads (private, API-gated)

Persistent Docker volumes:
  - lazyflow_data -> /app/data
  - lazyflow_uploads -> /app/uploads
  - lazyflow_backups -> /backups (for snapshots)
```

## Milestones (Phased ULTRAWORK)

| Milestone | Goal | Tasks | Exit Condition |
|---|---|---|---|
| M1 | Baseline + hardening spec | 1-2 | Docker/env/security baseline approved |
| M2 | Container build strategy | 3-4 | App + proxy images build locally |
| M3 | Runtime orchestration + persistence | 5-7 | Compose stack healthy; webhook flow stable |
| M4 | Operations safety | 6,8-9 | Backup/restore, rollout, rollback validated |
| M5 | Production readiness proof | 10-11 | Smoke matrix passes and runbook finalized |

## Immediate Implementation Sequence (Phase 1-2, Minimal-Risk)

### Phase 1 - Safe Scaffolding (new files only; zero runtime behavior change)

1. Create `.dockerignore`
   - Must contain ignores for: `.git`, `node_modules`, `.env*`, `uploads`, `data`, `.sisyphus`, local build artifacts.
   - Goal: prevent secrets/data leakage into image build context.

2. Create `.env.prod.example`
   - Must define required prod keys: `NODE_ENV`, `PORT`, `APP_URL`, `MINI_APP_URL`, `BOT_TOKEN`, `WEBHOOK_SECRET`, `DB_PATH=/app/data/lazyflow.db`, optional Google keys, strict CORS allowlist variable.
   - Must include comments for secret generation and file permissions.

3. Create `scripts/build-frontend-prod.sh`
   - Must define deterministic frontend build flow (Bun install + static artifact build) and output location consumed by proxy image.
   - Must fail fast on missing artifact.

4. Create `Dockerfile` (app)
   - Must include: Bun base image pin, dependency install with lockfile, app copy, non-root user, writable paths only for `/app/data` and `/app/uploads`, entrypoint `bun run src/index.ts`.

5. Create reverse-proxy artifacts:
   - `docker/nginx/Dockerfile`
   - `docker/nginx/nginx.conf`
   - `docker/nginx/conf.d/default.conf`
   - Must include: static frontend serving, API/webhook proxy to app, request size limits, basic security headers, no direct uploads exposure.

6. Create `docker-compose.yml` (initial)
   - Must include services: `app`, `reverse-proxy`; named volumes for data/uploads/backups; internal network; restart policies; healthchecks.
   - Must include log rotation options on both services.

### Phase 2 - Controlled Hardening (small, targeted runtime changes)

7. Update `src/env.ts`
   - Must add explicit production env contract (strict origin allowlist, optional log level, safe defaults only for dev).
   - Must keep startup validation fail-fast for missing required prod secrets.

8. Update `src/api/index.ts`
   - Must replace `origin: '*'` with env-driven allowlist behavior.
   - Must preserve existing headers/methods and route wiring.

9. Create operational scripts:
   - `ops/backup/sqlite-backup.sh`
   - `ops/backup/sqlite-restore.sh`
   - `ops/deploy/rollout.sh`
   - `ops/deploy/rollback.sh`
   - `ops/smoke/smoke.sh`
   - Must include explicit checks for health, webhook status, DB integrity, and rollback trigger handling.

10. Add deployment runbook (`docs/deploy-beget.md` or `README.md` section)
   - Must include: exact command order, pre-deploy backup requirement, rollback decision tree, post-deploy smoke checklist.

### Phase 1-2 Done Criteria

- `docker compose config` passes.
- `docker compose build` succeeds for both images.
- `bun test` remains green after hardening edits.
- `/health` check passes via proxy in deployed stack.
- Webhook info check confirms production URL and no critical error.

## File-Level Task Map

| Path | Action | Purpose |
|---|---|---|
| `.dockerignore` | create | Smaller, safer build context |
| `Dockerfile` | create | Production app image (Bun) |
| `docker-compose.yml` | create | Service orchestration + healthchecks + volumes |
| `docker/nginx/nginx.conf` | create | Global reverse-proxy hardening/log format |
| `docker/nginx/conf.d/default.conf` | create | Route mapping API/webhook/static |
| `docker/nginx/Dockerfile` | create | Nginx image with static frontend artifact |
| `scripts/build-frontend-prod.sh` | create | Deterministic frontend build via Bun |
| `ops/backup/sqlite-backup.sh` | create | Consistent SQLite WAL backup |
| `ops/backup/sqlite-restore.sh` | create | Controlled restore procedure |
| `ops/deploy/rollout.sh` | create | Repeatable deployment sequence |
| `ops/deploy/rollback.sh` | create | Repeatable rollback sequence |
| `ops/smoke/smoke.sh` | create | Post-deploy smoke checks |
| `.env.prod.example` | create | Production env contract |
| `src/env.ts` | modify | Add strict production env keys (CORS/API base/log level) |
| `src/api/index.ts` | modify | Replace wildcard CORS with env-controlled allowlist |
| `README.md` (or `docs/deploy-beget.md`) | modify/create | Operator runbook and incident steps |

## Verification Strategy

### Test Decision
- Infrastructure exists: YES (`bun test` and existing tests in `src/__tests__`).
- User wants tests for this scope: Manual-first operational verification + regression test gate.
- Framework: `bun test` for app regression, command-based smoke checks for deployment.

### Validation Gates
1. Pre-build gate: `bun test` must pass.
2. Compose gate: all service healthchecks must become healthy.
3. Runtime gate: API + webhook + uploads access control + background jobs sanity.
4. Data gate: backup and restore dry-run verified.

## Task Dependency Graph

| Task | Depends On | Reason |
|---|---|---|
| 1. Deployment baseline and constraints | None | Starting point and assumptions freeze |
| 2. Env hardening contract | 1 | Needs finalized domains/secrets/CORS policy |
| 3. App Dockerfile and runtime image | 1,2 | Image depends on env contract and runtime constraints |
| 4. Reverse proxy image/config | 1,2 | Route and TLS policy depends on baseline/env |
| 5. Docker Compose stack definition | 3,4 | Compose references built images and runtime mounts |
| 6. SQLite WAL persistence/backup/restore | 3,5 | Requires container paths and volumes |
| 7. Telegram webhook/restart behavior | 5 | Needs final public routing and APP_URL |
| 8. Observability and log rotation | 5 | Logging/healthchecks wired in compose services |
| 9. Security hardening pass | 2,4,5 | Security controls span env, proxy, and compose |
| 10. Rollout and rollback procedures | 6,7,8,9 | Needs backup, webhook, observability, security baseline |
| 11. Smoke tests and release checklist | 10 | Must validate final rollout flow |

## Parallel Execution Graph

```text
Wave 1 (Start immediately)
├── Task 1: Deployment baseline and constraints
└── Task 2: Env hardening contract

Wave 2 (After Wave 1)
├── Task 3: App Dockerfile and runtime image
└── Task 4: Reverse proxy image/config

Wave 3 (After Wave 2)
├── Task 5: Docker Compose stack definition
├── Task 6: SQLite WAL persistence/backup/restore
├── Task 7: Telegram webhook/restart behavior
├── Task 8: Observability and log rotation
└── Task 9: Security hardening pass

Wave 4 (After Wave 3)
└── Task 10: Rollout and rollback procedures

Wave 5 (After Wave 4)
└── Task 11: Smoke tests and release checklist

Critical Path: 1 -> 3 -> 5 -> 10 -> 11
Estimated Parallel Speedup: ~35-45% vs purely sequential execution
```

## Risk Matrix

| ID | Risk | Probability | Impact | Early Signal | Mitigation | Rollback Trigger |
|---|---|---|---|---|---|---|
| R1 | Webhook not reachable (TLS/domain/proxy mismatch) | Medium | High | Telegram `getWebhookInfo` errors | Pre-deploy webhook URL validation + Nginx route test | >2 min failed webhook delivery after deploy |
| R2 | SQLite corruption or lock issues during backup | Medium | High | backup size mismatch, `database is locked` | Use `.backup` with sqlite3, store WAL-compatible snapshots, stop writes for restore | Backup integrity check fails |
| R3 | Frontend artifact mismatch (stale `frontend/dist`) | Medium | Medium | UI errors or wrong API base | Deterministic frontend build script + checksum artifact | Smoke test UI/API handshake fails |
| R4 | Data loss from non-persistent mounts | Low | Critical | DB resets after restart | Named volumes for `/app/data` and `/app/uploads` | Missing expected rows/files after restart |
| R5 | Overly permissive CORS in prod | High | High | Cross-origin requests from unknown origin succeed | Env-driven strict allowlist and deny-by-default | Security gate detects wildcard CORS |
| R6 | Uploads accidentally exposed publicly | Medium | High | Direct file URL access without auth | Do not mount uploads into Nginx web root; keep API-gated access only | Unauthorized file access observed |
| R7 | Disk fill from logs/backups | Medium | Medium | Rapid growth in `/var/lib/docker` | Compose log rotation + backup retention policy | Free disk below threshold (for example <15%) |
| R8 | Background jobs duplicate or stall after restart | Low | Medium | Unexpected duplicate notifications | Keep single app replica, verify startup recovery logs | Repeated job side effects observed |

## Verification Matrix

| Area | Command | Expected Result | Evidence |
|---|---|---|---|
| Build gate | `bun test` | Exit code 0 | Test output saved |
| Compose config | `docker compose config` | Valid merged config, no errors | Command output |
| Service health | `docker compose ps` | `healthy` for app/proxy | `ps` output |
| API health | `curl -fsS https://<domain>/health` | JSON with `status: ok` | Response body |
| Webhook route | `curl -i https://<domain>/webhook/<secret>` (GET should be 404/405, path resolves) | Route reachable through proxy | HTTP status and headers |
| Telegram webhook registration | `curl -fsS "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"` | URL matches production webhook, no last_error_message | JSON output |
| Upload privacy | request `/files/<mediaId>` without auth | 401/404 | HTTP status |
| DB persistence | restart stack then query app behavior | Data remains | Before/after check notes |
| Backup integrity | `sqlite3 <backup-file> "PRAGMA integrity_check;"` | `ok` | CLI output |
| Log rotation | inspect `json-file` options in compose and file growth | bounded logs | `docker inspect` / disk usage |

## Tasks

### Task 1: Freeze deployment baseline and non-negotiables
**Description**: Define production topology, domain/TLS assumptions, exposed ports, and no-Kubernetes boundary; create deployment decision record.

**Delegation Recommendation**:
- Category: `ultrabrain` - architecture-level decision locking with cross-cutting impact.
- Skills: [`git-master`, `typescript-programmer`] - repository-aware planning and config-level consistency.

**Skills Evaluation**:
- INCLUDED `git-master`: needed for structured file change planning and commit granularity.
- INCLUDED `typescript-programmer`: required to align env/runtime decisions with TS code surface.
- OMITTED `agent-browser`: browser automation not needed for baseline definition.
- OMITTED `frontend-ui-ux`: no UI/UX design work.
- OMITTED `dev-browser`: persistent browser state not needed.
- OMITTED `python-programmer`: no Python runtime in target.
- OMITTED `svelte-programmer`: frontend is React, not Svelte.
- OMITTED `golang-tui-programmer`: no Go/TUI scope.
- OMITTED `python-debugger`: no Python debugging scope.
- OMITTED `data-scientist`: no analytics pipeline work.
- OMITTED `prompt-engineer`: no LLM prompt optimization task.

**Depends On**: None

**Acceptance Criteria**:
- Architecture record written with explicit components: reverse proxy + app + persistent volumes.
- Domain/TLS dependency declared for Telegram webhook.
- Explicit exclusion of Kubernetes documented.

### Task 2: Define production environment hardening contract
**Description**: Create `.env.prod.example` and env policy (required secrets, allowed origins, webhook secret, db path, upload path, runtime mode, log level).

**Delegation Recommendation**:
- Category: `unspecified-high` - security-sensitive but mostly configuration work.
- Skills: [`typescript-programmer`, `git-master`] - env keys must map cleanly to `src/env.ts` and tracked changes.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: map env keys to runtime validators in TS.
- INCLUDED `git-master`: organize env contract and docs atomically.
- OMITTED `agent-browser`: not required.
- OMITTED `frontend-ui-ux`: not relevant.
- OMITTED `dev-browser`: not required.
- OMITTED `python-programmer`: not required.
- OMITTED `svelte-programmer`: not required.
- OMITTED `golang-tui-programmer`: not required.
- OMITTED `python-debugger`: not required.
- OMITTED `data-scientist`: not required.
- OMITTED `prompt-engineer`: not required.

**Depends On**: Task 1

**Acceptance Criteria**:
- `.env.prod.example` contains all required production variables (including strict CORS origin allowlist and non-dev webhook secret).
- `NODE_ENV=production`, `APP_URL=https://...`, `DB_PATH=/app/data/lazyflow.db` documented as required prod values.
- Secret handling guidance added (file permissions, no commit of `.env.prod`).

### Task 3: Implement app Dockerfile strategy (Bun runtime)
**Description**: Add production Dockerfile (multi-stage if needed) with non-root execution, minimal runtime dependencies, deterministic install, and app health readiness.

**Delegation Recommendation**:
- Category: `unspecified-high` - infra + runtime composition with security concerns.
- Skills: [`typescript-programmer`, `git-master`] - ensure Bun/TS runtime compatibility and clean commit units.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: validate runtime entrypoint and TS execution expectations.
- INCLUDED `git-master`: atomic infra commits and dependency ordering.
- OMITTED `agent-browser`: not needed.
- OMITTED `frontend-ui-ux`: not needed.
- OMITTED `dev-browser`: not needed.
- OMITTED `python-programmer`: not needed.
- OMITTED `svelte-programmer`: not needed.
- OMITTED `golang-tui-programmer`: not needed.
- OMITTED `python-debugger`: not needed.
- OMITTED `data-scientist`: not needed.
- OMITTED `prompt-engineer`: not needed.

**Depends On**: Tasks 1,2

**Acceptance Criteria**:
- `Dockerfile` builds successfully.
- Container runs `bun run src/index.ts` with production env.
- Container runs as non-root user and writes only to mounted `/app/data` and `/app/uploads`.
- Health endpoint reachable at container network path `http://127.0.0.1:3000/health`.

### Task 4: Implement reverse proxy + static frontend strategy
**Description**: Add Nginx config/image to serve Mini App static bundle and proxy API/webhook routes to app container.

**Delegation Recommendation**:
- Category: `visual-engineering` - frontend delivery path and proxy/static behavior.
- Skills: [`frontend-ui-ux`, `git-master`] - safe static app delivery and structured infra commits.

**Skills Evaluation**:
- INCLUDED `frontend-ui-ux`: ensures Mini App static delivery remains correct across mobile Telegram webview contexts.
- INCLUDED `git-master`: infrastructure files and config changes should stay atomic.
- OMITTED `agent-browser`: defer browser checks to smoke-test task.
- OMITTED `dev-browser`: defer browser checks to smoke-test task.
- OMITTED `typescript-programmer`: core of this task is Nginx/static routing.
- OMITTED `python-programmer`: not required.
- OMITTED `svelte-programmer`: not required.
- OMITTED `golang-tui-programmer`: not required.
- OMITTED `python-debugger`: not required.
- OMITTED `data-scientist`: not required.
- OMITTED `prompt-engineer`: not required.

**Depends On**: Tasks 1,2

**Acceptance Criteria**:
- `/` serves frontend static index.
- API/webhook routes are proxied to app service without exposing filesystem uploads.
- Security headers and request body limits are configured.
- Proxy container has healthcheck endpoint validation.

### Task 5: Compose services, volumes, networks, healthchecks
**Description**: Create `docker-compose.yml` with app/proxy services, persistent volumes, restart policies, environment wiring, and healthchecks.

**Delegation Recommendation**:
- Category: `ultrabrain` - orchestration and service dependency graphing.
- Skills: [`git-master`, `typescript-programmer`] - compose + env integration with TS runtime.

**Skills Evaluation**:
- INCLUDED `git-master`: critical for splitting service and policy changes cleanly.
- INCLUDED `typescript-programmer`: ensures compose env aligns with runtime expectations.
- OMITTED `agent-browser`: not needed.
- OMITTED `frontend-ui-ux`: not central to this task.
- OMITTED `dev-browser`: not needed.
- OMITTED `python-programmer`: not needed.
- OMITTED `svelte-programmer`: not needed.
- OMITTED `golang-tui-programmer`: not needed.
- OMITTED `python-debugger`: not needed.
- OMITTED `data-scientist`: not needed.
- OMITTED `prompt-engineer`: not needed.

**Depends On**: Tasks 3,4

**Acceptance Criteria**:
- `docker compose config` succeeds.
- Services declare `restart: unless-stopped` and log rotation options.
- App depends on persistent volumes for DB/uploads/backups.
- Healthchecks gate startup ordering (`depends_on` with healthy condition where supported).

### Task 6: SQLite WAL persistence + backup/restore strategy
**Description**: Implement operational scripts and policy for consistent WAL backups, integrity checks, retention, and restore workflow.

**Delegation Recommendation**:
- Category: `unspecified-high` - data safety and operational reliability.
- Skills: [`git-master`, `typescript-programmer`] - DB path/runtime consistency and controlled script additions.

**Skills Evaluation**:
- INCLUDED `git-master`: backup/restore scripts and runbook should be isolated and auditable.
- INCLUDED `typescript-programmer`: align DB path/env assumptions with app code.
- OMITTED `agent-browser`: not needed.
- OMITTED `frontend-ui-ux`: not needed.
- OMITTED `dev-browser`: not needed.
- OMITTED `python-programmer`: not needed.
- OMITTED `svelte-programmer`: not needed.
- OMITTED `golang-tui-programmer`: not needed.
- OMITTED `python-debugger`: not needed.
- OMITTED `data-scientist`: not needed.
- OMITTED `prompt-engineer`: not needed.

**Depends On**: Tasks 3,5

**Acceptance Criteria**:
- Backup script uses consistent method (`sqlite3 .backup` or controlled app stop) and stores timestamped snapshot.
- Restore script documents safe stop/restore/start sequence.
- Integrity check (`PRAGMA integrity_check`) and retention policy are documented and executable.
- Recovery drill procedure exists and is linked in runbook.

### Task 7: Telegram webhook and restart behavior hardening
**Description**: Define deploy-time webhook validation and restart-safe behavior, including expected `setWebhook` and `getWebhookInfo` checks.

**Delegation Recommendation**:
- Category: `unspecified-high` - external integration correctness and reliability.
- Skills: [`typescript-programmer`, `git-master`] - behavior ties directly to existing `src/index.ts` logic.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: needed to align webhook assumptions with current production branch logic.
- INCLUDED `git-master`: ensures focused changes around bot/webhook operations.
- OMITTED `agent-browser`: not needed.
- OMITTED `frontend-ui-ux`: not needed.
- OMITTED `dev-browser`: not needed.
- OMITTED `python-programmer`: not needed.
- OMITTED `svelte-programmer`: not needed.
- OMITTED `golang-tui-programmer`: not needed.
- OMITTED `python-debugger`: not needed.
- OMITTED `data-scientist`: not needed.
- OMITTED `prompt-engineer`: not needed.

**Depends On**: Task 5

**Acceptance Criteria**:
- Runbook includes command to verify webhook URL and pending update status.
- Restart behavior documented: container restart does not switch to long polling in production.
- Webhook secret path handling documented and validated.

### Task 8: Observability and log rotation
**Description**: Add operational visibility baselines (container logs, health probes, job signal checks) and bounded log growth.

**Delegation Recommendation**:
- Category: `unspecified-high` - production operations reliability.
- Skills: [`git-master`, `typescript-programmer`] - structured infra changes plus app signal alignment.

**Skills Evaluation**:
- INCLUDED `git-master`: clean separation of observability and deployment changes.
- INCLUDED `typescript-programmer`: app logs/health semantics come from TS code paths.
- OMITTED `agent-browser`: not needed.
- OMITTED `frontend-ui-ux`: not needed.
- OMITTED `dev-browser`: not needed.
- OMITTED `python-programmer`: not needed.
- OMITTED `svelte-programmer`: not needed.
- OMITTED `golang-tui-programmer`: not needed.
- OMITTED `python-debugger`: not needed.
- OMITTED `data-scientist`: not needed.
- OMITTED `prompt-engineer`: not needed.

**Depends On**: Task 5

**Acceptance Criteria**:
- Compose logging driver options (`max-size`, `max-file`) set for services.
- Healthchecks and failure indicators are documented for app and proxy.
- Job lifecycle log lines are included in smoke inspection checklist.

### Task 9: Security hardening implementation plan
**Description**: Lock down runtime and network surface: strict CORS, non-root containers, minimized privileges, private uploads, secret hygiene.

**Delegation Recommendation**:
- Category: `ultrabrain` - multi-layer security controls with high blast radius.
- Skills: [`typescript-programmer`, `git-master`] - code/config security alignment and atomic changes.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: strict CORS and env validation tie directly to TS app code.
- INCLUDED `git-master`: security hardening must be reviewable and reversible.
- OMITTED `agent-browser`: not needed.
- OMITTED `frontend-ui-ux`: not needed.
- OMITTED `dev-browser`: not needed.
- OMITTED `python-programmer`: not needed.
- OMITTED `svelte-programmer`: not needed.
- OMITTED `golang-tui-programmer`: not needed.
- OMITTED `python-debugger`: not needed.
- OMITTED `data-scientist`: not needed.
- OMITTED `prompt-engineer`: not needed.

**Depends On**: Tasks 2,4,5

**Acceptance Criteria**:
- CORS no longer wildcard in production path.
- Upload directory is not exposed by reverse proxy static root.
- Containers run with least privilege settings documented.
- Secrets management and file permission guidance documented.

### Task 10: Rollout and rollback procedure
**Description**: Define zero-surprise rollout sequence with pre-deploy backup, deploy checks, rollback conditions, and restore flow.

**Delegation Recommendation**:
- Category: `ultrabrain` - operational reliability and incident handling.
- Skills: [`git-master`, `typescript-programmer`] - ensure scripts and runtime assumptions stay consistent.

**Skills Evaluation**:
- INCLUDED `git-master`: operational scripts and docs must be auditable.
- INCLUDED `typescript-programmer`: rollback conditions depend on runtime behavior.
- OMITTED `agent-browser`: not required.
- OMITTED `frontend-ui-ux`: not required.
- OMITTED `dev-browser`: not required.
- OMITTED `python-programmer`: not required.
- OMITTED `svelte-programmer`: not required.
- OMITTED `golang-tui-programmer`: not required.
- OMITTED `python-debugger`: not required.
- OMITTED `data-scientist`: not required.
- OMITTED `prompt-engineer`: not required.

**Depends On**: Tasks 6,7,8,9

**Acceptance Criteria**:
- Rollout script/checklist includes backup before container replacement.
- Rollback script/checklist supports previous image tag + optional DB restore.
- Defined rollback triggers (healthcheck fail, webhook fail, smoke fail) documented.

### Task 11: Post-deploy smoke tests and final runbook
**Description**: Build smoke suite and operator documentation for production checks and routine operations.

**Delegation Recommendation**:
- Category: `writing` - precise operational documentation and executable checklists.
- Skills: [`git-master`, `agent-browser`] - structured change tracking and optional browser-level smoke validation.

**Skills Evaluation**:
- INCLUDED `git-master`: keeps runbook/smoke assets coherent and reviewable.
- INCLUDED `agent-browser`: useful for Telegram Mini App web smoke paths.
- OMITTED `frontend-ui-ux`: not a design task.
- OMITTED `dev-browser`: optional but not required for one-shot smoke flows.
- OMITTED `typescript-programmer`: minimal code-level changes expected here.
- OMITTED `python-programmer`: not needed.
- OMITTED `svelte-programmer`: not needed.
- OMITTED `golang-tui-programmer`: not needed.
- OMITTED `python-debugger`: not needed.
- OMITTED `data-scientist`: not needed.
- OMITTED `prompt-engineer`: not needed.

**Depends On**: Task 10

**Acceptance Criteria**:
- Smoke checklist covers health/API/webhook/uploads/privacy/background jobs.
- Runbook includes day-2 operations: restart, backup, restore, rollback.
- Release readiness checklist can be executed end-to-end without missing steps.

## Dockerfile Strategy (Implementation Guidance)

- App image (`Dockerfile`):
  - Base: `oven/bun:<version>-slim` (pin exact version).
  - Workdir: `/app`.
  - Copy lockfiles + install with frozen lockfile semantics.
  - Copy source + frontend artifact generation step.
  - Install runtime utility needed for DB backup integrity checks (`sqlite3` CLI) if absent.
  - Run as non-root user.
  - Entrypoint: `bun run src/index.ts`.
- Proxy image (`docker/nginx/Dockerfile`):
  - Base: `nginx:alpine`.
  - Copy hardened nginx configs.
  - Copy frontend production artifact (not raw source) to web root.

## docker-compose Service Blueprint (Implementation Guidance)

- `app`:
  - build from root `Dockerfile`
  - env file `.env.prod`
  - expose internal `3000`
  - volumes:
    - `lazyflow_data:/app/data`
    - `lazyflow_uploads:/app/uploads`
    - `lazyflow_backups:/backups`
  - healthcheck: `GET /health`
  - restart: `unless-stopped`
  - logging: json-file rotation
- `reverse-proxy`:
  - build from `docker/nginx/Dockerfile`
  - ports `80:80` and optionally `443:443`
  - depends on app health
  - does not mount uploads volume
  - healthcheck on proxied `/health`
  - restart: `unless-stopped`
  - logging: json-file rotation

## SQLite WAL Persistence / Backup / Restore Strategy

- Persistence:
  - DB file must live at `/app/data/lazyflow.db` on named volume.
  - Keep WAL mode enabled as current schema sets (`PRAGMA journal_mode=WAL`).
- Backup:
  - Preferred: online backup via `sqlite3 /app/data/lazyflow.db ".backup '/backups/lazyflow-<ts>.db'"`.
  - Post-backup integrity: `sqlite3 <backup> "PRAGMA integrity_check;"` -> `ok`.
  - Retention: keep N daily + M weekly snapshots (documented policy).
- Restore:
  - Stop write traffic (`docker compose stop app`).
  - Replace DB from selected backup into data volume.
  - Remove stale WAL/SHM if present and incompatible.
  - Start app and run integrity + smoke checks.

## Telegram Webhook / Restart Behavior

- Production app path in `src/index.ts` already sets webhook on startup using `APP_URL` and `WEBHOOK_SECRET`.
- Required controls:
  - Ensure `APP_URL` is stable HTTPS origin.
  - Ensure reverse proxy forwards `/webhook/:secret` to app.
  - Verify webhook after each deploy/restart with `getWebhookInfo`.
  - Keep single app replica to avoid duplicate background job workers.

## Security Hardening Checklist

- No wildcard CORS in production (`origin` must be explicit allowlist).
- Non-root containers; minimize writable paths.
- Never expose `/uploads` as static directory.
- Keep `.env.prod` outside VCS; set strict file permissions on VPS.
- Use strong random `WEBHOOK_SECRET` and `GOOGLE_OAUTH_STATE_SECRET`.
- Enforce request body limits in proxy for upload abuse control.

## Exact Command Checklist (No execution in this phase)

### A) Preflight (VPS)
```bash
docker --version
docker compose version
uname -a
df -h
```

### B) Pre-deploy Validation (repo)
```bash
bun install --frozen-lockfile
bun test
test -f .env.prod || cp .env.prod.example .env.prod
```

### C) Build and config validation
```bash
docker compose config
docker compose build --no-cache
docker compose images
```

### D) First rollout
```bash
docker compose up -d
docker compose ps
docker compose logs app --tail=100
docker compose logs reverse-proxy --tail=100
curl -fsS https://<domain>/health
```

### E) Telegram webhook validation
```bash
curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

### F) Backup operation
```bash
docker compose exec app sqlite3 /app/data/lazyflow.db ".backup '/backups/lazyflow-$(date +%F-%H%M%S).db'"
docker compose exec app ls -lah /backups
docker compose exec app sqlite3 /backups/<backup-file>.db "PRAGMA integrity_check;"
```

### G) Restore operation (controlled)
```bash
docker compose stop app
docker compose run --rm app sh -lc 'cp /backups/<backup-file>.db /app/data/lazyflow.db && rm -f /app/data/lazyflow.db-wal /app/data/lazyflow.db-shm'
docker compose up -d app
curl -fsS https://<domain>/health
```

### H) Rollback
```bash
docker compose down
# switch image tag/env to previous known-good release
docker compose up -d
docker compose ps
curl -fsS https://<domain>/health
```

## Rollout Procedure

1. Freeze target release tag and previous rollback tag.
2. Create DB backup and integrity-check it.
3. Deploy new stack (`up -d`), wait for healthchecks.
4. Validate `/health`, webhook info, key API endpoints.
5. Run smoke suite.
6. Mark release successful only if verification matrix passes.

## Rollback Procedure

1. Trigger rollback if critical check fails (health, webhook, data integrity, auth).
2. Re-deploy previous image tag.
3. If needed, restore pre-deploy DB backup.
4. Re-run smoke suite and webhook verification.
5. Capture incident note and root-cause actions.

## Post-Deploy Smoke Tests

- Health/API:
  - `GET /health` returns `{status:"ok"}`.
  - authenticated endpoint (for example `/me`) responds without 5xx.
- Webhook:
  - `getWebhookInfo.url` matches `https://<domain>/webhook/<secret>`.
  - no active `last_error_message`.
- Upload privacy:
  - unauthenticated access to `/files/:mediaId` denied.
- Background jobs:
  - app logs contain startup + cron registration lines.
- Persistence:
  - data survives `docker compose restart`.

## Commit Strategy

| Commit Group | Files | Message Template |
|---|---|---|
| 1 | `.dockerignore`, `Dockerfile`, `docker/nginx/*` | `build(deploy): add production container images` |
| 2 | `docker-compose.yml`, `.env.prod.example` | `chore(deploy): add compose orchestration and env contract` |
| 3 | `ops/backup/*`, `ops/deploy/*`, `ops/smoke/*` | `ops(deploy): add backup rollback and smoke scripts` |
| 4 | `src/env.ts`, `src/api/index.ts` | `fix(security): harden production env and cors policy` |
| 5 | `README.md` or deployment doc | `docs(deploy): add beget production runbook` |

## Success Criteria

- Architecture implemented as reverse proxy + app container + persistent volumes.
- Production env is hardened (no wildcard CORS, strong secrets, non-root runtime, private uploads).
- Compose stack healthy and restart-safe.
- SQLite WAL persistence, backup, and restore tested with integrity checks.
- Telegram webhook survives deployment/restart and remains correctly configured.
- Observability/log rotation and operational runbook are in place.
- Rollout and rollback can be executed from checklist without improvisation.
