#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="ops/deploy/.release-state"

APP_IMAGE="${1:-}"
PROXY_IMAGE="${2:-}"
BACKUP_FILE="${3:-}"

if [ -f "${STATE_FILE}" ]; then
  # shellcheck disable=SC1090
  source "${STATE_FILE}"
fi

if [ -z "${APP_IMAGE}" ]; then
  APP_IMAGE="${PREVIOUS_APP_IMAGE:-}"
fi

if [ -z "${PROXY_IMAGE}" ]; then
  PROXY_IMAGE="${PREVIOUS_PROXY_IMAGE:-}"
fi

if [ -z "${APP_IMAGE}" ] || [ -z "${PROXY_IMAGE}" ]; then
  echo "Usage: $0 <app-image> <proxy-image> [backup-file]" >&2
  echo "Example: $0 lazyflow-app:20260213-090000 lazyflow-caddy:20260213-090000 lazyflow-20260213-085500.db" >&2
  exit 1
fi

echo "Rolling back to images:"
echo "  app:   ${APP_IMAGE}"
echo "  proxy: ${PROXY_IMAGE}"

export LAZYFLOW_APP_IMAGE="${APP_IMAGE}"
export LAZYFLOW_PROXY_IMAGE="${PROXY_IMAGE}"

docker compose up -d app reverse-proxy

if [ -n "${BACKUP_FILE}" ]; then
  echo "Restoring database backup: ${BACKUP_FILE}"
  ./ops/backup/sqlite-restore.sh "${BACKUP_FILE}"
  docker compose up -d reverse-proxy
fi

docker compose ps

if [ -f ".env.prod" ]; then
  APP_URL="$(sed -n 's/^APP_URL=//p' .env.prod | tail -n 1)"
  if [ -n "${APP_URL}" ]; then
    curl -fsS "${APP_URL%/}/health" >/dev/null
  fi
fi

echo "Rollback completed"
