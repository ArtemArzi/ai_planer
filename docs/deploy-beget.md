# Deploy to Beget VPS (Docker Compose)

## Architecture

- `app` container: Bun runtime, Hono API, Telegram bot webhook handler, background jobs.
- `reverse-proxy` container: Caddy serves frontend static bundle, proxies API/webhook traffic, and auto-manages TLS.
- Named volumes:
  - `lazyflow_data` -> `/app/data` (SQLite WAL database)
  - `lazyflow_uploads` -> `/app/uploads` (private user media)
  - `lazyflow_backups` -> `/backups` (SQLite snapshots)

## Prerequisites

- Docker Engine and Docker Compose plugin installed on VPS.
- Domain pointed to VPS.
- Ports `80` and `443` open on VPS firewall.
- Telegram bot token and webhook secret created.

## Production environment

1. Create `.env.prod` from template:

```bash
cp .env.prod.example .env.prod
```

2. Fill required values:
- `NODE_ENV=production`
- `DOMAIN=<your-domain>`
- `ACME_EMAIL=<email-for-acme>`
- `APP_URL=https://<your-domain>`
- `MINI_APP_URL=https://<your-domain>`
- `CORS_ALLOWED_ORIGINS=https://<your-domain>`
- `BOT_TOKEN`, `WEBHOOK_SECRET`, `DB_PATH=/app/data/lazyflow.db`

3. Keep `.env.prod` out of git and set strict file permissions:

```bash
chmod 600 .env.prod
```

## First deployment

```bash
./scripts/build-frontend-prod.sh
docker compose config
docker compose build app reverse-proxy
docker compose up -d
docker compose ps
curl -fsS https://<your-domain>/health
```

## Release rollout

Use tagged images and automatic pre-deploy backup:

```bash
./ops/deploy/rollout.sh <release-tag>
```

What rollout does:
- Builds frontend artifact.
- Runs `bun test`.
- Creates SQLite backup and validates integrity.
- Builds tagged app/proxy images.
- Starts containers.
- Verifies `/health` and Telegram webhook URL/error state.
- Stores release state in `ops/deploy/.release-state`.

## Rollback

Rollback to previous images tracked in `ops/deploy/.release-state`:

```bash
./ops/deploy/rollback.sh
```

Rollback to explicit images and optional DB backup:

```bash
./ops/deploy/rollback.sh lazyflow-app:<tag> lazyflow-caddy:<tag> <backup-file>
```

## Backup and restore

Create backup:

```bash
./ops/backup/sqlite-backup.sh
```

Restore backup:

```bash
./ops/backup/sqlite-restore.sh <backup-file>
```

## Smoke verification

Run post-deploy smoke checks:

```bash
./ops/smoke/smoke.sh
```

Optional file-privacy check with specific media id:

```bash
./ops/smoke/smoke.sh <media-id>
```

## Go/No-Go checklist

No-Go if any item fails:

- `docker compose ps` shows unhealthy service.
- `https://<domain>/health` is not reachable.
- Telegram `getWebhookInfo.url` does not match `https://<domain>/webhook/<secret>`.
- Telegram `last_error_message` is non-empty.
- Unauthorized `/files/:mediaId` access returns success.
- Backup integrity check is not `ok`.

## Notes

- Keep one `app` replica to avoid duplicate background jobs.
- Do not mount `uploads` into Caddy static root.
- For disaster recovery, copy backup files off-host on a regular schedule.

## Caddy TLS notes

- Caddy stores certificates in Docker volumes `caddy_data` and `caddy_config`.
- Do not remove those volumes between redeploys, otherwise ACME issuance can hit rate limits.
- Ensure DNS A/AAAA records are propagated before first `docker compose up -d`.
