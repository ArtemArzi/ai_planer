#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/app/data/lazyflow.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_FILE="lazyflow-${TIMESTAMP}.db"

echo "Creating SQLite backup: ${BACKUP_FILE}"

if ! docker compose ps --status running --services | grep -q '^app$'; then
  echo "Skipping backup: app container is not running"
  echo "none"
  exit 0
fi

if ! docker compose exec -T app sh -lc "test -f '${DB_PATH}'"; then
  echo "Skipping backup: database file not found at ${DB_PATH}"
  echo "none"
  exit 0
fi

docker compose exec -T app sh -lc "sqlite3 '${DB_PATH}' \".backup '${BACKUP_DIR}/${BACKUP_FILE}'\""

INTEGRITY="$(docker compose exec -T app sh -lc "sqlite3 '${BACKUP_DIR}/${BACKUP_FILE}' 'PRAGMA integrity_check;'")"
if [ "${INTEGRITY}" != "ok" ]; then
  echo "Backup integrity check failed: ${INTEGRITY}" >&2
  exit 1
fi

docker compose exec -T app sh -lc "find '${BACKUP_DIR}' -maxdepth 1 -name 'lazyflow-*.db' -type f -mtime +${KEEP_DAYS} -delete"

echo "Backup completed: ${BACKUP_DIR}/${BACKUP_FILE}"
echo "${BACKUP_FILE}"
