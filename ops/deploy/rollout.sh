#!/usr/bin/env bash
set -euo pipefail

RELEASE_TAG="${1:-$(date -u +%Y%m%d-%H%M%S)}"
STATE_FILE="ops/deploy/.release-state"

if [ ! -f ".env.prod" ]; then
  echo "Missing .env.prod. Copy .env.prod.example and fill values first." >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" .env.prod | tail -n 1
}

APP_URL="$(read_env_value APP_URL)"
BOT_TOKEN="$(read_env_value BOT_TOKEN)"
WEBHOOK_SECRET="$(read_env_value WEBHOOK_SECRET)"

if [ -z "${APP_URL}" ] || [ -z "${BOT_TOKEN}" ] || [ -z "${WEBHOOK_SECRET}" ]; then
  echo "APP_URL, BOT_TOKEN and WEBHOOK_SECRET must be set in .env.prod" >&2
  exit 1
fi

echo "Building frontend artifact"
./scripts/build-frontend-prod.sh

echo "Running tests"
bun test

echo "Creating pre-deploy backup"
BACKUP_FILE="$(./ops/backup/sqlite-backup.sh | tail -n 1)"
if [ "${BACKUP_FILE}" = "none" ]; then
  BACKUP_FILE=""
fi

LAZYFLOW_APP_IMAGE="lazyflow-app:${RELEASE_TAG}"
LAZYFLOW_PROXY_IMAGE="lazyflow-caddy:${RELEASE_TAG}"
export LAZYFLOW_APP_IMAGE
export LAZYFLOW_PROXY_IMAGE

echo "Validating compose config"
docker compose config >/dev/null

echo "Building release images"
docker compose build app reverse-proxy

echo "Starting release"
docker compose up -d

echo "Waiting for container health"
sleep 5
docker compose ps

echo "Checking health endpoint"
curl -fsS "${APP_URL%/}/health" >/dev/null

EXPECTED_WEBHOOK="${APP_URL%/}/webhook/${WEBHOOK_SECRET}"
WEBHOOK_INFO="$(curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")"
CURRENT_WEBHOOK="$(printf '%s' "${WEBHOOK_INFO}" | bun -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.result?.url ?? "");});')"
LAST_ERROR="$(printf '%s' "${WEBHOOK_INFO}" | bun -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.result?.last_error_message ?? "");});')"

if [ "${CURRENT_WEBHOOK}" != "${EXPECTED_WEBHOOK}" ]; then
  echo "Webhook URL mismatch." >&2
  echo "Expected: ${EXPECTED_WEBHOOK}" >&2
  echo "Actual:   ${CURRENT_WEBHOOK}" >&2
  exit 1
fi

if [ -n "${LAST_ERROR}" ]; then
  echo "Telegram webhook reports error: ${LAST_ERROR}" >&2
  exit 1
fi

PREVIOUS_APP_IMAGE=""
PREVIOUS_PROXY_IMAGE=""
if [ -f "${STATE_FILE}" ]; then
  # shellcheck disable=SC1090
  source "${STATE_FILE}"
  PREVIOUS_APP_IMAGE="${CURRENT_APP_IMAGE:-}"
  PREVIOUS_PROXY_IMAGE="${CURRENT_PROXY_IMAGE:-}"
fi

cat > "${STATE_FILE}" <<EOF
PREVIOUS_APP_IMAGE=${PREVIOUS_APP_IMAGE}
PREVIOUS_PROXY_IMAGE=${PREVIOUS_PROXY_IMAGE}
CURRENT_APP_IMAGE=${LAZYFLOW_APP_IMAGE}
CURRENT_PROXY_IMAGE=${LAZYFLOW_PROXY_IMAGE}
LAST_BACKUP_FILE=${BACKUP_FILE}
EOF

echo "Rollout successful"
echo "Release tag: ${RELEASE_TAG}"
if [ -n "${BACKUP_FILE}" ]; then
  echo "Backup file: ${BACKUP_FILE}"
else
  echo "Backup file: not created (first deploy or empty database)"
fi
if [ -n "${PREVIOUS_APP_IMAGE}" ] && [ -n "${PREVIOUS_PROXY_IMAGE}" ]; then
  if [ -n "${BACKUP_FILE}" ]; then
    echo "Rollback command: ./ops/deploy/rollback.sh ${PREVIOUS_APP_IMAGE} ${PREVIOUS_PROXY_IMAGE} ${BACKUP_FILE}"
  else
    echo "Rollback command: ./ops/deploy/rollback.sh ${PREVIOUS_APP_IMAGE} ${PREVIOUS_PROXY_IMAGE}"
  fi
fi
