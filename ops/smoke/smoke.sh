#!/usr/bin/env bash
set -euo pipefail

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

if [ -z "${APP_URL}" ]; then
  echo "APP_URL missing in .env.prod" >&2
  exit 1
fi

if [ -z "${BOT_TOKEN}" ] || [ -z "${WEBHOOK_SECRET}" ]; then
  echo "BOT_TOKEN and WEBHOOK_SECRET must be set in .env.prod" >&2
  exit 1
fi

echo "[1/6] Health endpoint"
curl -fsS "${APP_URL%/}/health" >/dev/null

echo "[2/6] Containers are running"
docker compose ps

echo "[3/6] App logs contain job registration"
if ! docker compose logs app --tail=300 | grep -q "\[Jobs\] Registered"; then
  echo "Expected job registration logs were not found" >&2
  exit 1
fi

echo "[4/6] Webhook configuration"
WEBHOOK_INFO="$(curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")"
CURRENT_WEBHOOK="$(printf '%s' "${WEBHOOK_INFO}" | bun -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.result?.url ?? "");});')"
LAST_ERROR="$(printf '%s' "${WEBHOOK_INFO}" | bun -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.result?.last_error_message ?? "");});')"
EXPECTED_WEBHOOK="${APP_URL%/}/webhook/${WEBHOOK_SECRET}"

if [ "${CURRENT_WEBHOOK}" != "${EXPECTED_WEBHOOK}" ]; then
  echo "Webhook mismatch. Expected ${EXPECTED_WEBHOOK}, got ${CURRENT_WEBHOOK}" >&2
  exit 1
fi

if [ -n "${LAST_ERROR}" ]; then
  echo "Telegram webhook error detected: ${LAST_ERROR}" >&2
  exit 1
fi

echo "[5/6] Persistence sanity"
docker compose restart app >/dev/null
sleep 2
curl -fsS "${APP_URL%/}/health" >/dev/null

echo "[6/6] Unauthorized file access"
if [ -n "${1:-}" ]; then
  FILE_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL%/}/files/$1")"
  case "${FILE_STATUS}" in
    401|403|404)
      ;;
    *)
      echo "Expected unauthorized status for /files/$1, got ${FILE_STATUS}" >&2
      exit 1
      ;;
  esac
else
  echo "Skipped /files/:mediaId check (pass media id as first arg to enable)"
fi

echo "Smoke checks passed"
