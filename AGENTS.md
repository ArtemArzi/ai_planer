# LAZY FLOW — Project Knowledge Base

**Generated:** 2026-02-12
**Stack:** Bun (Runtime), Hono (API), SQLite WAL (DB), grammY (Bot), React 18 + Vite (Frontend).

## OVERVIEW
Telegram-native task manager. Philosophy: "Capture = Exhale, Review = Inhale". Minimal cognitive load task management via Mini App and Bot.

## STRUCTURE
```
/home/artem/planer/
├── src/
│   ├── api/           # Hono REST API (Auth via Telegram initData)
│   ├── bot/           # grammY handlers (Message capture, notifications)
│   ├── db/            # SQLite schema, migrations, Bun:sqlite CRUD
│   ├── lib/           # AI classification, shared types, capture logic
│   └── jobs/          # Background crons (Sunset, Mixer)
├── frontend/          # React 18 Mini App (Vite + Bun.serve proxy)
├── .sisyphus/         # Project docs, plans, and working memory
└── uploads/           # User media (Private, served via /files/:id)
```

## CRITICAL RULES
- **Timestamps**: ALWAYS use MILLISECONDS (`Date.now()` or `unixepoch() * 1000`). NEVER use bare `unixepoch()`.
- **API Responses**: DB columns are `snake_case`. JSON responses MUST be `camelCase`. Use `rowToDTO()` in DB layer or `toDTO()` helper.
- **Database**: ALWAYS enable `PRAGMA foreign_keys = ON`. Use `WAL` mode.
- **TDD**: Follow Red-Green-Refactor for core logic (Auth, Capture, Sunset, Mixer).
- **Security**: 
  - NEVER expose OAuth tokens in `/me`.
  - NEVER serve `/uploads` statically; use `/files/:mediaId` with ownership check.
  - ALWAYS validate Telegram `initData` (HMAC-SHA256, 24h expiry).
  - ALWAYS escape user content in Telegram MarkdownV2.
- **AI Logic**: 
  - Race Condition: AI classification MUST check `updatedAt > originalCreatedAt` before and after processing.
  - Classification skip: If task was updated by user during AI processing, discard AI result.

## ENGINES
- **Sunset**: Archives `active` tasks (not ideas, no deadline) if `last_interaction_at < 30 days` and `updated_at < 1 hour`. Location: `src/jobs/sunset.ts`.
- **Mixer**: Resurfaces up to 5 random `backlog` tasks (not ideas) per day. Location: `src/jobs/mixer.ts`.
- **Capture**: Precedence: Tags > Length > Media > URL > AI. Location: `src/lib/capture.ts`.

## DEVIATIONS & GOTCHAS
- **Entry Point**: Root `index.ts` is redundant. Use `src/index.ts`.
- **Frontend Dev**: Uses custom `frontend/dev.ts` (Bun.serve proxy) and `scripts/dev.sh` (mutates index.html with sed).
- **Lockfiles**: Root and `frontend/` have independent `bun.lockb` files.
- **Phonetic Naming**: `/skrin/` folder contains UI screenshots/captures.

## COMMANDS
```bash
bun install             # Install dependencies
bun run src/index.ts    # Start Backend + Bot
bun run frontend/dev.ts # Start Frontend Dev Server
bun test                # Run Bun tests
./scripts/dev.sh        # Full orchestrated dev environment (tmux + ngrok)
```

## WHERE TO LOOK
- **Capture Logic**: `src/lib/capture.ts` (Rules for prefix parsing).
- **Bot Handlers**: `src/bot/handlers/` (Message processing logic).
- **API Routes**: `src/api/routes/` (Endpoint definitions).
- **State**: `frontend/src/stores/uiStore.ts` (Zustand).
