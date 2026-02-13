#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <backup-file-name>" >&2
  echo "Example: $0 lazyflow-20260213-090000.db" >&2
  exit 1
fi

BACKUP_FILE="$1"
DB_PATH="${DB_PATH:-/app/data/lazyflow.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

echo "Restoring SQLite from backup: ${BACKUP_FILE}"

docker compose stop app

docker compose run --rm --no-deps app sh -lc "test -f '${BACKUP_DIR}/${BACKUP_FILE}'"
docker compose run --rm --no-deps app sh -lc "cp '${BACKUP_DIR}/${BACKUP_FILE}' '${DB_PATH}' && rm -f '${DB_PATH}-wal' '${DB_PATH}-shm'"

INTEGRITY="$(docker compose run --rm --no-deps app sh -lc "sqlite3 '${DB_PATH}' 'PRAGMA integrity_check;'")"
if [ "${INTEGRITY}" != "ok" ]; then
  echo "Restore integrity check failed: ${INTEGRITY}" >&2
  exit 1
fi

docker compose up -d app

echo "Restore completed for ${DB_PATH}"
