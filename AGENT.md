# LAZY FLOW — Agent Context

> AI-ready project context. Read this first.

## Project

**Name**: LAZY FLOW  
**Type**: Telegram-native task manager with Mini App  
**Philosophy**: "Capture = Exhale, Review = Inhale" — minimal cognitive load

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Backend | Hono |
| Database | SQLite (WAL mode) |
| Bot | grammY |
| AI | OpenAI GPT-4o-mini + Gemini Flash fallback |
| Frontend | React 18 + Vite |
| State | Zustand (UI) + TanStack Query (server) |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Sheets | Vaul |
| Telegram SDK | `@telegram-apps/sdk-react` v2.x |
| Cron | croner |

---

## Project Structure

```
/home/artem/planer/
├── src/
│   ├── api/           # Hono REST API routes
│   ├── bot/           # grammY bot handlers
│   ├── db/            # SQLite schema, CRUD functions
│   ├── lib/           # Shared utilities, types, capture logic
│   ├── jobs/          # Background crons (Sunset, Mixer, etc.)
│   └── __tests__/     # Bun test files
├── frontend/          # Vite + React Mini App (separate build)
├── .sisyphus/
│   ├── docs/          # Detailed specifications
│   ├── plans/         # Work plans for Sisyphus
│   └── drafts/        # Working memory during planning
└── uploads/           # User media files (NOT served statically!)
```

---

## Specifications

| File | Content |
|------|---------|
| `.sisyphus/docs/01-backend-spec.md` | DB schema, API endpoints, background jobs |
| `.sisyphus/docs/02-frontend-spec.md` | Components, stores, animations |
| `.sisyphus/docs/03-bot-spec.md` | Bot commands, message capture, notifications |
| `.sisyphus/drafts/audit_fixes.md` | 56 fixes from 5 audit sessions |

---

## Critical Rules

### Timestamps
```
ALL timestamps = MILLISECONDS (JavaScript Date.now() format)
SQLite: unixepoch() * 1000
NEVER use bare unixepoch()
```

### API Responses
```
SQLite columns: snake_case
JSON responses: camelCase
ALWAYS use toDTO() transformation
```

### Security
```
NEVER expose OAuth tokens in /me endpoint
NEVER serve /uploads statically → use /files/:mediaId with auth
NEVER use dangerouslySetInnerHTML
ALWAYS escape user content in Telegram Markdown
ALWAYS validate initData expiry (24h max)
```

### Capture Precedence (Tag wins!)
```
1. Explicit Tag (#w, #p, #i) → folder from tag
2. Content Length (>500 chars) → type='note', folder='notes'
3. Media Attachment → folder='media' (unless tag present)
4. URL Detection → folder='media' (unless tag present)
5. AI Classification → fallback
```

### Notes Behavior
```
Notes (>500 chars) are EXCLUDED from Sunset (never auto-archive)
Notes bypass Inbox → status='active' directly
Notes CAN live in work/personal/ideas if user tags them
```

### Undo Pattern
```
Use Map<taskId, UndoAction> for multiple pending actions
Store timer reference for cancellation
On undo: clearTimeout(action.timerId)
beforeunload: only commit actions with elapsed 2s window
```

---

## Excluded from MVP (Guardrails)

- Custom folders table/endpoints
- Task reorder endpoint  
- FTS5 search
- i18n / theme switcher
- Video/sticker/poll support
- Offline mutation queue
- `@grammyjs/conversations` (not needed)

---

## Key Architectural Decisions

| Decision | Details |
|----------|---------|
| Auth | Telegram initData, HMAC-SHA256 validation |
| Files | Protected via `/files/:mediaId` with ownership check |
| AI Race | Check `updatedAt > createdAt` before applying classification |
| Optimistic Updates | Rollback + `toast.error()` on failure |
| Media Queue | Rate limit 5/user/min, retry 3x with backoff |
| Sunset | Runs 3 AM UTC, excludes notes/ideas/deadlined tasks |
| Mixer | Max 5 tasks/day, 14-day cooldown, excludes notes |

---

## Testing

**Framework**: `bun:test`  
**Approach**: TDD for core logic  
**Run**: `bun test`

**Must test**:
- Auth middleware (expiry, tampering)
- Capture precedence (all rules)
- Sunset engine (exclusions)
- Mixer engine (idempotency)

---

## Work Plan

Active plan: `.sisyphus/plans/lazyflow-implementation.md`

To execute: `/start-work`
