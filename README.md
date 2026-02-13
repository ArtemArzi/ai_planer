# LAZY FLOW (ai_planer)

LAZY FLOW - это Telegram-first планер, который помогает быстро выгружать мысли и задачи из головы в систему, а потом спокойно разбирать их в удобном темпе.

Ключевая идея проекта:
- **Capture = Exhale**: быстро записал мысль/задачу и выдохнул.
- **Review = Inhale**: позже осознанно разобрал входящий поток.

## Что умеет проект

- Telegram Bot для быстрого захвата задач и заметок.
- Telegram Mini App (React) для полноценного управления задачами.
- Гибкая структура статусов: inbox, active, backlog, done, archived, deleted.
- Работа с медиа (фото, документы, голос, ссылки) и приватный доступ к файлам.
- Фоновая автоматизация:
  - **Sunset** - архивирует устаревшие активные задачи.
  - **Mixer** - подмешивает забытые backlog-задачи обратно в фокус.
- Опциональная AI-классификация задач.
- Опциональная интеграция с Google Calendar.

## Технологический стек

- **Backend**: Bun + Hono + grammY
- **Frontend**: React 18 + Bun bundler + Tailwind
- **Database**: SQLite (WAL)
- **Infra**: Docker Compose + Caddy (авто HTTPS)

## Структура проекта

```text
src/
  api/        # REST API (Hono)
  bot/        # Telegram bot (grammY)
  db/         # SQLite schema, CRUD, миграции
  jobs/       # Sunset, Mixer и другие фоновые задачи
  lib/        # capture/AI/shared logic
frontend/     # Telegram Mini App (React)
ops/          # deploy/backup/rollback/smoke scripts
docker/       # Caddy config for production
```

## Локальный запуск

### 1) Подготовка окружения

```bash
cp .env.example .env
```

Минимально обязательный env для запуска backend:
- `BOT_TOKEN`

Рекомендуется также задать:
- `WEBHOOK_SECRET`
- `APP_URL`
- `MINI_APP_URL`

### 2) Установка зависимостей

```bash
bun install
```

```bash
cd frontend && bun install
```

### 3) Запуск backend

```bash
bun run src/index.ts
```

### 4) Запуск frontend (отдельный терминал)

```bash
cd frontend && bun run dev
```

Опционально для полного dev-окружения есть скрипт `./scripts/dev.sh`.

## Тесты

```bash
bun test
```

## Production / Deploy

Пошаговый runbook:
- `docs/deploy-beget.md`

Основные команды:

```bash
./scripts/build-frontend-prod.sh
./ops/deploy/rollout.sh <release-tag>
./ops/smoke/smoke.sh
```

Rollback:

```bash
./ops/deploy/rollback.sh
```

## Важные замечания

- В проде backend запускается через `src/index.ts`.
- `uploads/` не должен отдаваться статикой напрямую.
- Для Telegram webhook нужен валидный HTTPS-домен.
