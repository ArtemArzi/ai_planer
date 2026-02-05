# LAZY FLOW: Full Implementation Plan

## Context

### Original Request
Implement LAZY FLOW - a Telegram-native task manager with Mini App following the "Capture = Exhale, Review = Inhale" philosophy.

### Interview Summary
**Key Decisions**:
- Implementation order: Backend → Bot → Frontend
- Testing strategy: TDD approach
- Each stage = working, testable product
- Calendar sync and Stories carousel deferred to Stage 6

**Specifications**:
- `.sisyphus/docs/01-backend-spec.md` - Backend (Bun + Hono + SQLite + grammY)
- `.sisyphus/docs/02-frontend-spec.md` - Frontend (React + Vite + Tailwind + Framer Motion)
- `.sisyphus/docs/03-bot-spec.md` - Telegram Bot (grammY)
- `.sisyphus/drafts/audit_fixes.md` - 56 fixes from 5 audit sessions

### Metis Review
**Critical Issues Identified & Resolved**:
- SDK package rename: `@tma.js/sdk-react` → `@telegram-apps/sdk-react` v2.x
- Missing `deadline_notified` column in tasks table
- Missing `sunset_notification_count` column for ghost trail
- `@grammyjs/conversations` not needed (single-message onboarding)
- Custom folders/reorder endpoints not in backend spec - DEFERRED
- `window.confirm()` → custom confirmation sheet

---

## Work Objectives

### Core Objective
Build and deploy a fully functional Telegram task manager with bot capture, Mini App review, and background automation.

### Concrete Deliverables
1. **Backend**: Bun + Hono REST API with SQLite, auth middleware
2. **Bot**: grammY Telegram bot with tag detection, AI classification, media handling
3. **Mini App**: React SPA with swipe cards, Today list, Shelves tab
4. **Background Jobs**: Sunset, Mixer, notifications, cleanup crons
5. **Optional**: Google Calendar sync, Stories carousel

### Definition of Done
- [ ] `bun run dev` starts backend + bot in long polling mode
- [ ] Telegram bot responds to messages with ✓ and creates tasks
- [ ] Mini App opens from bot menu button and displays Inbox/Today
- [ ] All TDD tests pass: `bun test`
- [ ] Deployed to Coolify with persistent SQLite

### Must Have
- Private chat only (ignore groups)
- Tag detection (#w, #p, #i)
- AI classification with timeout/fallback
- 4-direction swipe cards
- 2s undo window with timer cancellation
- Auth via Telegram initData validation
- Timestamps in milliseconds everywhere

### Must NOT Have (Guardrails)
- NO custom folders table/endpoints (not in backend spec)
- NO task reorder endpoint (not in backend spec)
- NO FTS5 search (LIKE is fine for MVP)
- NO i18n (Russian only)
- NO theme switcher (inherits from Telegram)
- NO video/sticker/poll support
- NO offline mutation queue (optimistic + rollback only)
- NO `dangerouslySetInnerHTML` anywhere
- NO `@grammyjs/conversations` (not needed)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (new project)
- **User wants tests**: YES (TDD)
- **Framework**: `bun:test` (native Bun test runner)

### TDD Approach

Each core logic task follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
   - Test file: `src/__tests__/{module}.test.ts`
   - Test command: `bun test {file}`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `bun test {file}`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green

### Test Coverage Focus
- Auth middleware (initData validation, expiry, tampering)
- Capture precedence logic (Tag > Length > Media > AI)
- Sunset engine (exclusions, race conditions)
- Mixer engine (idempotency, exclusions)
- DTO transformation (snake_case → camelCase)

---

## Task Flow

```
Stage 0: Pre-flight Validation
    ↓
Stage 1: Backend Core (DB + API + Auth)
    ↓
Stage 2: Telegram Bot (Capture + AI + Media)
    ↓
Stage 3: Mini App Core (Inbox + Today)
    ↓
Stage 4: Mini App Full (Shelves + Sheets + Animations)
    ↓
Stage 5: Background Jobs (Sunset, Mixer, Notifications)
    ↓
Stage 6: Integrations (Calendar, Stories) [OPTIONAL]
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| N/A | Sequential | Each stage depends on previous |

---

## TODOs

---

### STAGE 0: Pre-flight Validation

> **Purpose**: Verify assumptions before writing production code. Prevents discovering broken dependencies in Stage 3.

---

- [x] 0.1. Project Scaffold

  **What to do**:
  - Create project root structure:
    ```
    /home/artem/planer/
    ├── src/
    │   ├── api/           # Hono REST API
    │   ├── bot/           # grammY bot
    │   ├── db/            # SQLite setup, migrations
    │   ├── lib/           # Shared utilities
    │   ├── jobs/          # Background crons
    │   └── __tests__/     # Test files
    ├── frontend/          # Vite + React app (separate build)
    ├── package.json
    ├── tsconfig.json
    ├── bunfig.toml
    └── .env.example
    ```
  - Initialize: `bun init`
  - Add dependencies: `bun add hono grammy croner`
  - Add dev dependencies: `bun add -d typescript @types/bun`

  **Must NOT do**:
  - Don't add `@grammyjs/conversations` (not needed)
  - Don't create frontend yet (Stage 3)

  **Parallelizable**: NO (first task)

  **References**:
  - `01-backend-spec.md:107-117` - Technical stack table
  - `03-bot-spec.md:37-43` - Bot technical stack

  **Acceptance Criteria**:
  - [ ] `bun --version` returns >= 1.0
  - [ ] `package.json` exists with hono, grammy, croner
  - [ ] `tsconfig.json` exists with strict mode
  - [ ] Directory structure matches above

  **Commit**: YES
  - Message: `chore: scaffold project structure`
  - Files: `package.json, tsconfig.json, bunfig.toml, src/`, `.env.example`

---

- [x] 0.2. Validate Bun + SQLite WAL Mode

  **What to do**:
  - Create `src/db/test-sqlite.ts`:
    ```typescript
    import { Database } from 'bun:sqlite';
    
    const db = new Database(':memory:');
    
    // Test WAL mode
    db.run('PRAGMA journal_mode = WAL');
    const result = db.query('PRAGMA journal_mode').get();
    console.log('WAL mode:', result);
    
    // Test RETURNING clause
    db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const inserted = db.query('INSERT INTO test (name) VALUES (?) RETURNING *').get('hello');
    console.log('RETURNING works:', inserted);
    
    // Test unixepoch() * 1000
    const ts = db.query('SELECT unixepoch() * 1000 as ts').get();
    console.log('Timestamp (ms):', ts);
    
    console.log('✅ All SQLite features verified');
    ```
  - Run: `bun run src/db/test-sqlite.ts`

  **Must NOT do**:
  - Don't proceed if any test fails

  **Parallelizable**: YES (with 0.3, 0.4)

  **References**:
  - `01-backend-spec.md:125-131` - SQLite PRAGMA settings
  - `01-backend-spec.md:139-145` - Timestamp convention

  **Acceptance Criteria**:
  - [ ] WAL mode returns `{ journal_mode: 'wal' }`
  - [ ] RETURNING returns the inserted row
  - [ ] Timestamp is 13-digit number (milliseconds)

  **Commit**: NO (temporary test file)

---

- [x] 0.3. Validate Telegram SDK v2.x API

  **What to do**:
  - Create `frontend/package.json` with:
    ```json
    {
      "name": "lazyflow-frontend",
      "dependencies": {
        "@telegram-apps/sdk-react": "^2.0.0",
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      }
    }
    ```
  - Run: `cd frontend && bun install`
  - Verify import works in a test file:
    ```typescript
    import { init, backButton, miniApp } from '@telegram-apps/sdk-react';
    console.log('SDK v2.x imports work');
    ```

  **Must NOT do**:
  - Don't use old package name `@tma.js/sdk-react`
  - Don't build full frontend yet

  **Parallelizable**: YES (with 0.2, 0.4)

  **References**:
  - Metis review: SDK package renamed, v2.x uses signals API
  - `02-frontend-spec.md:43` - (outdated reference to @tma.js)

  **Acceptance Criteria**:
  - [ ] `@telegram-apps/sdk-react` installed
  - [ ] Import statement compiles without error
  - [ ] Package version is 2.x

  **Commit**: NO (temporary validation)

---

- [x] 0.4. Validate croner Works in Bun

  **What to do**:
  - Create `src/jobs/test-cron.ts`:
    ```typescript
    import { Cron } from 'croner';
    
    const job = new Cron('* * * * * *', () => {
      console.log('Cron fired at', new Date().toISOString());
    });
    
    console.log('Cron scheduled, waiting 3 seconds...');
    await Bun.sleep(3000);
    job.stop();
    console.log('✅ Croner works in Bun');
    ```
  - Run: `bun run src/jobs/test-cron.ts`

  **Parallelizable**: YES (with 0.2, 0.3)

  **References**:
  - `01-backend-spec.md:116` - croner for cron jobs

  **Acceptance Criteria**:
  - [ ] Cron fires at least 2 times in 3 seconds
  - [ ] No runtime errors

  **Commit**: NO (temporary test)

---

- [x] 0.5. Create Shared Types

  **What to do**:
  - Create `src/lib/types.ts` with TaskDTO, UserDTO from spec:
    ```typescript
    export interface TaskDTO {
      id: string;
      userId: number;
      content: string;
      type: 'task' | 'note';
      status: 'inbox' | 'active' | 'backlog' | 'done' | 'archived' | 'deleted';
      folder: 'work' | 'personal' | 'ideas' | 'media' | 'notes';
      isIdea: boolean;
      isMixerResurfaced: boolean;
      deadline: number | null;
      scheduledDate: string | null;
      scheduledTime: string | null;
      googleEventId: string | null;
      createdAt: number;
      updatedAt: number;
      lastInteractionAt: number;
      lastSeenAt: number | null;
      completedAt: number | null;
      deletedAt: number | null;
      source: 'bot' | 'miniapp' | 'calendar';
      telegramMessageId: number | null;
    }
    
    export interface UserDTO {
      telegramId: number;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      timezone: string;
      notificationsEnabled: boolean;
      morningDigestTime: string;
      deadlineReminderMinutes: number;
      storiesNotifications: boolean;
      aiClassificationEnabled: boolean;
      hasGoogleCalendar: boolean;
      createdAt: number;
    }
    
    export type Folder = TaskDTO['folder'];
    export type TaskStatus = TaskDTO['status'];
    export type TaskType = TaskDTO['type'];
    ```

  **Parallelizable**: NO (depends on 0.1)

  **References**:
  - `01-backend-spec.md:45-82` - Required DTO shapes

  **Acceptance Criteria**:
  - [ ] Types compile without errors
  - [ ] All fields from spec included

  **Commit**: YES
  - Message: `feat: add shared TypeScript types`
  - Files: `src/lib/types.ts`

---

### STAGE 1: Backend Core

> **Purpose**: Database schema, REST API, auth middleware. Backend is testable standalone.

---

- [x] 1.1. Database Schema + Migrations

  **What to do**:
  - Create `src/db/schema.sql` with ALL tables from spec:
    - `users` table (include all fields from spec)
    - `tasks` table with:
      - `deadline_notified INTEGER DEFAULT 0` (MISSING IN SPEC - add it!)
      - Unique index on `(user_id, telegram_message_id)`
    - `media` table
    - `media_queue` table
    - `sunset_notifications` table for ghost trail count
  - Create `src/db/index.ts`:
    - Initialize Database with WAL mode
    - Run schema.sql on startup
    - Export db instance
  - Create `src/db/helpers.ts`:
    - `toDTO()` function for snake_case → camelCase

  **Must NOT do**:
  - Don't add `folders` table (not in backend spec)
  - Don't add `position` column for reorder

  **Parallelizable**: NO (first backend task)

  **References**:
  - `01-backend-spec.md:125-131` - SQLite PRAGMA settings
  - `01-backend-spec.md:149-181` - users table
  - `01-backend-spec.md:184-236` - tasks table
  - `01-backend-spec.md:238-271` - media table
  - `01-backend-spec.md:273-305` - media_queue table
  - `01-backend-spec.md:22-36` - toDTO() transformation

  **Acceptance Criteria**:
  - [ ] `bun run src/db/index.ts` creates database without errors
  - [ ] All tables exist: `SELECT name FROM sqlite_master WHERE type='table'`
  - [ ] `tasks` has `deadline_notified` column
  - [ ] Unique index exists on `(user_id, telegram_message_id)`
  - [ ] Timestamps default to milliseconds: `SELECT unixepoch() * 1000`

  **Commit**: YES
  - Message: `feat(db): add SQLite schema with all tables`
  - Files: `src/db/schema.sql, src/db/index.ts, src/db/helpers.ts`

---

- [x] 1.2. TDD: Auth Middleware

  **What to do**:
  - Create `src/__tests__/auth.test.ts`:
    ```typescript
    describe('validateInitData', () => {
      it('rejects missing initData', ...);
      it('rejects expired initData (>24h)', ...);
      it('rejects tampered hash', ...);
      it('accepts valid initData', ...);
      it('extracts user ID correctly', ...);
    });
    ```
  - RED: Run `bun test src/__tests__/auth.test.ts` → FAIL
  - Create `src/api/middleware/auth.ts`:
    - Implement `validateInitData()` per spec
    - Implement `authMiddleware` for Hono
  - GREEN: Run `bun test` → PASS
  - REFACTOR: Clean up

  **Parallelizable**: NO (depends on 1.1)

  **References**:
  - `01-backend-spec.md:688-759` - Auth middleware implementation
  - `01-backend-spec.md:704-740` - validateInitData function

  **Acceptance Criteria**:
  - [ ] Test file exists with 5+ test cases
  - [ ] `bun test src/__tests__/auth.test.ts` → all pass
  - [ ] Expired initData (>24h) returns null
  - [ ] Wrong hash returns null
  - [ ] Valid data returns parsed user object

  **Commit**: YES
  - Message: `feat(api): add auth middleware with TDD`
  - Files: `src/api/middleware/auth.ts, src/__tests__/auth.test.ts`

---

- [x] 1.3. TDD: Capture Precedence Logic

  **What to do**:
  - Create `src/__tests__/capture.test.ts`:
    ```typescript
    describe('processMessage', () => {
      it('#w tag → folder=work, even with URL', ...);
      it('#p tag → folder=personal', ...);
      it('#i tag → folder=ideas, isIdea=true', ...);
      it('>500 chars without tag → folder=notes, type=note', ...);
      it('>500 chars WITH #w tag → folder=work, type=note', ...);
      it('photo without tag → folder=media', ...);
      it('photo WITH #w tag → folder=work', ...);
      it('URL without tag → folder=media', ...);
      it('plain text → needsAiClassification=true', ...);
      it('empty after tag → error', ...);
    });
    ```
  - RED: Tests fail
  - Create `src/lib/capture.ts` implementing logic from bot spec
  - GREEN: Tests pass

  **Parallelizable**: YES (with 1.4)

  **References**:
  - `01-backend-spec.md:307-329` - Capture Precedence Matrix
  - `03-bot-spec.md:532-649` - processMessage implementation

  **Acceptance Criteria**:
  - [ ] 10+ test cases cover all precedence rules
  - [ ] `bun test src/__tests__/capture.test.ts` → all pass
  - [ ] Tag > Length > Media > AI ordering verified

  **Commit**: YES
  - Message: `feat(lib): add capture precedence logic with TDD`
  - Files: `src/lib/capture.ts, src/__tests__/capture.test.ts`

---

- [x] 1.4. Database CRUD Functions

  **What to do**:
  - Create `src/db/users.ts`:
    - `upsertUser(data)` - create or update
    - `getUser(telegramId)` → UserDTO
    - `updateUser(telegramId, updates)`
    - `deleteUser(telegramId)` - cascade delete
  - Create `src/db/tasks.ts`:
    - `createTask(data)` → TaskDTO
    - `getTask(id)` → TaskDTO | null
    - `getTasks(filter)` → TaskDTO[] with cursor pagination
    - `updateTask(id, updates)` → TaskDTO
    - `findTaskByTelegramMessageId(userId, msgId)`
    - `countTasks(userId, status)`
  - Create `src/db/media.ts`:
    - `createMedia(data)`
    - `getMedia(id)`
    - `getMediaForTask(taskId)`

  **Parallelizable**: YES (with 1.3)

  **References**:
  - `01-backend-spec.md:45-82` - DTO shapes
  - `01-backend-spec.md:856-866` - getTasks with pagination

  **Acceptance Criteria**:
  - [ ] All CRUD functions work with in-memory SQLite
  - [ ] `toDTO()` applied to all returns
  - [ ] Pagination with cursor works

  **Commit**: YES
  - Message: `feat(db): add CRUD functions for users, tasks, media`
  - Files: `src/db/users.ts, src/db/tasks.ts, src/db/media.ts`

---

- [x] 1.5. REST API Endpoints

  **What to do**:
  - Create `src/api/index.ts` - Hono app setup
  - Create `src/api/routes/health.ts`:
    - `GET /health` → `{ status: 'ok' }`
  - Create `src/api/routes/users.ts`:
    - `GET /me` → UserDTO (no tokens!)
    - `PATCH /me/settings` → update user settings
    - `DELETE /me` → delete account
    - `GET /export` → GDPR export
  - Create `src/api/routes/tasks.ts`:
    - `GET /tasks` with filters
    - `POST /tasks` with validation
    - `PATCH /tasks/:id` with optimistic locking (409 on conflict)
    - `DELETE /tasks/:id` → soft delete
    - `PATCH /tasks/batch` → bulk update
    - `GET /tasks/search`
  - Create `src/api/routes/files.ts`:
    - `GET /files/:mediaId` → stream file with auth

  **Must NOT do**:
  - Don't add `/folders` endpoints
  - Don't add `/tasks/reorder` endpoint
  - Don't expose tokens in `/me`

  **Parallelizable**: NO (depends on 1.2, 1.4)

  **References**:
  - `01-backend-spec.md:764-768` - Health check
  - `01-backend-spec.md:770-810` - /me endpoints
  - `01-backend-spec.md:856-973` - /tasks endpoints
  - `01-backend-spec.md:990-1021` - /files/:mediaId
  - `01-backend-spec.md:1106-1149` - /tasks/batch

  **Acceptance Criteria**:
  - [ ] `GET /health` returns 200
  - [ ] `GET /me` returns camelCase DTO without tokens
  - [ ] `PATCH /tasks/:id` with wrong `expectedUpdatedAt` returns 409
  - [ ] `GET /files/:mediaId` requires auth and verifies ownership
  - [ ] All responses are camelCase

  **Commit**: YES
  - Message: `feat(api): add REST endpoints for users, tasks, files`
  - Files: `src/api/index.ts, src/api/routes/*.ts`

---

- [x] 1.6. Rate Limiting

  **What to do**:
  - Create `src/api/middleware/rateLimit.ts`:
    - In-memory rate limiter (no external package needed)
    - 100 requests/minute per user
    - Key by userId from auth
  - Apply to all `/api/*` routes

  **Parallelizable**: NO (depends on 1.5)

  **References**:
  - `01-backend-spec.md:1215-1223` - Rate limiting config

  **Acceptance Criteria**:
  - [ ] 101st request within 1 minute returns 429
  - [ ] Different users have separate limits

  **Commit**: YES
  - Message: `feat(api): add in-memory rate limiting`
  - Files: `src/api/middleware/rateLimit.ts`

---

- [x] 1.7. Main Entry Point

  **What to do**:
  - Create `src/index.ts`:
    - Initialize database
    - Create Hono app with API routes
    - Export for Bun.serve
  - Create `src/env.ts`:
    - Load and validate environment variables
    - Required: `BOT_TOKEN`, `WEBHOOK_SECRET`, `APP_URL`
  - Update `package.json`:
    - `"dev": "bun run --watch src/index.ts"`
    - `"test": "bun test"`

  **Parallelizable**: NO (depends on all 1.x)

  **References**:
  - `01-backend-spec.md:1186-1193` - Integration with Hono

  **Acceptance Criteria**:
  - [ ] `bun run dev` starts server on port 3000
  - [ ] `curl http://localhost:3000/health` returns 200
  - [ ] Missing env vars throw descriptive error

  **Commit**: YES
  - Message: `feat: add main entry point and dev script`
  - Files: `src/index.ts, src/env.ts, package.json`

---

### STAGE 2: Telegram Bot

> **Purpose**: Message capture, tag detection, AI classification, media handling. Bot works standalone.

---

- [ ] 2.1. Bot Setup

  **What to do**:
  - Create `src/bot/index.ts`:
    - Initialize grammY Bot
    - Add session middleware (simple, no conversations)
    - Add rate limit middleware
    - Add error handler with bot-blocked detection
  - Create `src/bot/keyboards.ts`:
    - Main keyboard with WebApp button
  - Register bot with Hono webhook route

  **Must NOT do**:
  - Don't add `@grammyjs/conversations`
  - Don't respond to group chats

  **Parallelizable**: NO (first bot task)

  **References**:
  - `03-bot-spec.md:50-76` - Bot configuration
  - `03-bot-spec.md:82-102` - Webhook vs polling
  - `03-bot-spec.md:127-158` - Keyboard layout

  **Acceptance Criteria**:
  - [ ] Bot initializes without errors
  - [ ] `/start` works in long polling mode
  - [ ] Error handler catches bot-blocked and disables notifications

  **Commit**: YES
  - Message: `feat(bot): add grammY bot setup with keyboard`
  - Files: `src/bot/index.ts, src/bot/keyboards.ts`

---

- [ ] 2.2. /start and /help Commands

  **What to do**:
  - Create `src/bot/handlers/commands.ts`:
    - `/start` → single welcome message + create user
    - `/help` → help text with tag examples
    - `/delete_me` → confirmation flow with inline keyboard

  **Parallelizable**: NO (depends on 2.1)

  **References**:
  - `03-bot-spec.md:255-282` - /start (simplified onboarding)
  - `03-bot-spec.md:286-310` - /help
  - `03-bot-spec.md:312-366` - /delete_me

  **Acceptance Criteria**:
  - [ ] `/start` creates user in DB
  - [ ] `/start` sends single welcome message
  - [ ] `/help` shows tag examples
  - [ ] `/delete_me` shows confirmation with inline buttons

  **Commit**: YES
  - Message: `feat(bot): add /start, /help, /delete_me commands`
  - Files: `src/bot/handlers/commands.ts`

---

- [ ] 2.3. Message Capture Handler

  **What to do**:
  - Create `src/bot/handlers/message.ts`:
    - Guard: private chat only
    - Guard: not keyboard button text
    - Guard: not unsupported message type
    - Call `processMessage()` from capture.ts
    - Create task in DB
    - Reply with ✓ on success, ❌ on error
    - Trigger async AI classification if needed
  - Handle media groups (albums) with debounce buffer

  **Must NOT do**:
  - Don't reply ✓ on error
  - Don't process group messages

  **Parallelizable**: NO (depends on 2.2, 1.3)

  **References**:
  - `03-bot-spec.md:375-456` - Main message handler
  - `03-bot-spec.md:458-527` - Media group handling

  **Acceptance Criteria**:
  - [ ] Text message → task in inbox with ✓
  - [ ] `#w text` → task in work folder
  - [ ] Group message → silently ignored
  - [ ] Error → ❌ reply, not ✓
  - [ ] Album → single task with multiple media

  **Commit**: YES
  - Message: `feat(bot): add message capture with tag detection`
  - Files: `src/bot/handlers/message.ts`

---

- [ ] 2.4. AI Classification

  **What to do**:
  - Create `src/lib/ai/classifier.ts`:
    - Interface: `AIClassifier { classify(text): Promise<{folder, confidence}> }`
    - `OpenAIClassifier` implementation
    - `GeminiClassifier` fallback
  - Create `src/lib/ai/index.ts`:
    - `classifyTaskAsync(taskId, originalCreatedAt)`:
      - Check if task was modified (race condition)
      - Try OpenAI with 10s timeout
      - Fallback to Gemini
      - Double-check before update

  **Parallelizable**: NO (depends on 2.3)

  **References**:
  - `01-backend-spec.md:586-624` - Provider abstraction
  - `01-backend-spec.md:626-682` - Classification flow with race check

  **Acceptance Criteria**:
  - [ ] OpenAI timeout falls back to Gemini
  - [ ] Both fail → task keeps default folder
  - [ ] Modified task → classification skipped
  - [ ] Returns valid folder: work | personal | ideas

  **Commit**: YES
  - Message: `feat(ai): add task classification with fallback`
  - Files: `src/lib/ai/classifier.ts, src/lib/ai/index.ts`

---

- [ ] 2.5. Media Handling

  **What to do**:
  - Create `src/bot/handlers/media.ts`:
    - Download file from Telegram
    - Save to `./uploads/{userId}/{taskId}.{ext}`
    - Create media record
    - For voice: set placeholder, enqueue transcription
  - Create `src/lib/media/ssrf.ts`:
    - `isPrivateIP()` check for link preview

  **Must NOT do**:
  - Don't process transcription yet (just enqueue)
  - Don't fetch private IPs

  **Parallelizable**: NO (depends on 2.3)

  **References**:
  - `01-backend-spec.md:1559-1684` - File storage and media processing
  - `01-backend-spec.md:517-518` - SSRF protection

  **Acceptance Criteria**:
  - [ ] Photo → file saved, media record created
  - [ ] Voice → placeholder text, queue job created
  - [ ] Link preview → blocks private IPs

  **Commit**: YES
  - Message: `feat(bot): add media handling with SSRF protection`
  - Files: `src/bot/handlers/media.ts, src/lib/media/ssrf.ts`

---

- [ ] 2.6. Message Edit Sync

  **What to do**:
  - Create handler for `edited_message` event:
    - Find task by `telegram_message_id`
    - Update content
    - Re-trigger AI classification if no tag

  **Parallelizable**: YES (with 2.7)

  **References**:
  - `03-bot-spec.md:654-678` - Message edit handling

  **Acceptance Criteria**:
  - [ ] Edit original message → task content updated
  - [ ] Task not found → silently ignored

  **Commit**: YES
  - Message: `feat(bot): add message edit sync`
  - Files: `src/bot/handlers/message.ts` (extend)

---

- [ ] 2.7. Keyboard Button Handlers

  **What to do**:
  - Create `src/bot/handlers/keyboard.ts`:
    - 🎯 Сегодня → show task list with inline checkboxes
    - 📥 Inbox → show count + link to app
    - ❓ Помощь → show help
  - Inline callback: `complete:{taskId}` → mark done, refresh list

  **Parallelizable**: YES (with 2.6)

  **References**:
  - `03-bot-spec.md:163-248` - Button handlers
  - `03-bot-spec.md:686-740` - Completion callback

  **Acceptance Criteria**:
  - [ ] 🎯 Сегодня shows numbered task list
  - [ ] ✅ button marks task done
  - [ ] Message length stays under 4096 chars

  **Commit**: YES
  - Message: `feat(bot): add keyboard button handlers`
  - Files: `src/bot/handlers/keyboard.ts`

---

- [ ] 2.8. Bot Integration with Hono

  **What to do**:
  - Update `src/index.ts`:
    - Add webhook route: `POST /webhook/:secret`
    - In dev mode: start long polling
  - Update `src/bot/index.ts`:
    - Export webhook callback
    - Export bot instance

  **Parallelizable**: NO (depends on all 2.x)

  **References**:
  - `03-bot-spec.md:1164-1192` - Integration with Hono

  **Acceptance Criteria**:
  - [ ] `bun run dev` starts both API and bot
  - [ ] Webhook works in production mode
  - [ ] Long polling works in dev mode

  **Commit**: YES
  - Message: `feat: integrate bot with Hono server`
  - Files: `src/index.ts, src/bot/index.ts`

---

### STAGE 3: Mini App Core

> **Purpose**: Basic Inbox + Today functionality. Swipe cards work.

---

- [ ] 3.1. Frontend Scaffold

  **What to do**:
  - Initialize in `frontend/`:
    ```bash
    cd frontend
    bun create vite . --template react-ts
    bun add @telegram-apps/sdk-react @tanstack/react-query zustand framer-motion vaul lucide-react
    bun add -d tailwindcss postcss autoprefixer
    npx tailwindcss init -p
    ```
  - Configure Tailwind with Telegram theme colors
  - Create directory structure:
    ```
    frontend/src/
    ├── providers/
    ├── stores/
    ├── api/
    ├── components/
    ├── hooks/
    └── App.tsx
    ```

  **Parallelizable**: NO (first frontend task)

  **References**:
  - `02-frontend-spec.md:31-43` - Technical stack
  - `02-frontend-spec.md:107-140` - Tailwind config

  **Acceptance Criteria**:
  - [ ] `bun run dev` starts Vite on port 5173
  - [ ] Tailwind compiles with Telegram theme colors
  - [ ] SDK v2.x imports work

  **Commit**: YES
  - Message: `feat(frontend): scaffold Vite + React + Tailwind`
  - Files: `frontend/*`

---

- [ ] 3.2. Telegram SDK Integration

  **What to do**:
  - Create `frontend/src/providers/TelegramProvider.tsx`:
    - Initialize SDK v2.x with `init()`
    - Call `miniApp.ready()` and `viewport.expand()`
    - Bind CSS variables
  - Create `frontend/src/hooks/useHaptic.ts`
  - Create `frontend/src/hooks/useBackButton.ts`

  **Must NOT do**:
  - Don't use old `@tma.js/sdk-react` patterns
  - Use signals API: `useSignal(backButton.isVisible)`

  **Parallelizable**: NO (depends on 3.1)

  **References**:
  - `02-frontend-spec.md:51-83` - Telegram provider (UPDATE for v2.x)
  - `02-frontend-spec.md:162-183` - Haptic hook
  - `02-frontend-spec.md:186-208` - Back button hook

  **Acceptance Criteria**:
  - [ ] App opens in Telegram with correct colors
  - [ ] Haptic feedback works on actions
  - [ ] Back button appears/hides correctly

  **Commit**: YES
  - Message: `feat(frontend): add Telegram SDK v2.x integration`
  - Files: `frontend/src/providers/TelegramProvider.tsx, frontend/src/hooks/use*.ts`

---

- [ ] 3.3. API Client + Query Setup

  **What to do**:
  - Create `frontend/src/api/client.ts`:
    - Fetch wrapper with auth header
    - 401 interceptor for expired session
  - Create `frontend/src/api/queryClient.ts`:
    - TanStack Query setup with persistence
  - Create `frontend/src/api/tasks.ts`:
    - `useTasks(filter)` query hook
    - `useInboxTasks()`, `useTodayTasks()`
    - `useUpdateTask()` mutation with optimistic update

  **Parallelizable**: NO (depends on 3.2)

  **References**:
  - `02-frontend-spec.md:354-385` - Query client with persistence
  - `02-frontend-spec.md:387-479` - Task hooks

  **Acceptance Criteria**:
  - [ ] `useTasks` fetches from backend
  - [ ] Optimistic update works
  - [ ] Rollback on error with toast
  - [ ] 401 shows "Session expired" message

  **Commit**: YES
  - Message: `feat(frontend): add API client and TanStack Query hooks`
  - Files: `frontend/src/api/*.ts`

---

- [ ] 3.4. UI Store (Zustand)

  **What to do**:
  - Create `frontend/src/stores/uiStore.ts`:
    - `activeTab`: 'focus' | 'shelves'
    - `pendingUndos`: Map<taskId, UndoAction>
    - `swipingTaskId`, `swipeDirection`
    - `openSheet`, `selectedTaskId`
    - `beforeunload` handler for pending undos

  **Parallelizable**: YES (with 3.3)

  **References**:
  - `02-frontend-spec.md:217-346` - UI Store with undo queue

  **Acceptance Criteria**:
  - [ ] Tab switching works
  - [ ] Undo queue supports multiple pending
  - [ ] `beforeunload` commits elapsed undos only

  **Commit**: YES
  - Message: `feat(frontend): add Zustand UI store`
  - Files: `frontend/src/stores/uiStore.ts`

---

- [ ] 3.5. SwipeCard Component

  **What to do**:
  - Create `frontend/src/components/SwipeCard.tsx`:
    - Framer Motion drag with 4 directions
    - Direction lock after 30px
    - Swipe overlays with icons
    - Down swipe → custom confirmation (NOT window.confirm)
  - Create `frontend/src/components/ConfirmSheet.tsx`:
    - Vaul drawer for delete confirmation

  **Must NOT do**:
  - Don't use `window.confirm()`

  **Parallelizable**: NO (depends on 3.4)

  **References**:
  - `02-frontend-spec.md:535-659` - SwipeCard component

  **Acceptance Criteria**:
  - [ ] Card drags in all 4 directions
  - [ ] Direction locks after threshold
  - [ ] Overlays show correct icons
  - [ ] Down swipe shows confirmation sheet

  **Commit**: YES
  - Message: `feat(frontend): add SwipeCard with 4-direction swipe`
  - Files: `frontend/src/components/SwipeCard.tsx, ConfirmSheet.tsx`

---

- [ ] 3.6. CardStack + InboxStack

  **What to do**:
  - Create `frontend/src/components/CardStack.tsx`:
    - Stack of 3 visible cards
    - AnimatePresence for exit
    - Scale/offset for preview cards
  - Create `frontend/src/components/InboxStack.tsx`:
    - Uses CardStack
    - Loading skeleton
    - Empty state with CTA
    - Swipe coachmark (one-time)
    - Bulk "Отложить всё" button when >10 items

  **Parallelizable**: NO (depends on 3.5)

  **References**:
  - `02-frontend-spec.md:662-712` - CardStack
  - `02-frontend-spec.md:715-862` - InboxStack

  **Acceptance Criteria**:
  - [ ] 3 cards visible in stack
  - [ ] Swipe removes top card, next animates up
  - [ ] Loading shows skeleton
  - [ ] Empty shows friendly message
  - [ ] Coachmark shows once

  **Commit**: YES
  - Message: `feat(frontend): add CardStack and InboxStack`
  - Files: `frontend/src/components/CardStack.tsx, InboxStack.tsx`

---

- [ ] 3.7. TaskRow + TodayList

  **What to do**:
  - Create `frontend/src/components/TaskRow.tsx`:
    - Checkbox with 44x44 touch target
    - 2s completion timer
    - Celebration animation
    - Timer cancellation on undo
  - Create `frontend/src/components/TodayList.tsx`:
    - List of TaskRows
    - Sorted by deadline
    - Empty state

  **Must NOT do**:
  - Don't add drag-and-drop reorder yet (no backend endpoint)

  **Parallelizable**: NO (depends on 3.6)

  **References**:
  - `02-frontend-spec.md:929-1027` - TaskRow
  - `02-frontend-spec.md:867-927` - TodayList

  **Acceptance Criteria**:
  - [ ] Checkbox triggers 2s timer
  - [ ] Timer cancels on undo
  - [ ] Touch target is 44x44 minimum
  - [ ] Celebration animation plays

  **Commit**: YES
  - Message: `feat(frontend): add TaskRow and TodayList`
  - Files: `frontend/src/components/TaskRow.tsx, TodayList.tsx`

---

- [ ] 3.8. TabBar + FAB + Snackbar

  **What to do**:
  - Create `frontend/src/components/TabBar.tsx`:
    - Focus and Shelves tabs
    - Safe area padding
  - Create `frontend/src/components/FloatingActionButton.tsx`:
    - + button, hides when sheet open
  - Create `frontend/src/components/Snackbar.tsx`:
    - Shows latest undo action
    - "Отменить всё" when multiple pending

  **Parallelizable**: NO (depends on 3.7)

  **References**:
  - `02-frontend-spec.md:1217-1260` - TabBar
  - `02-frontend-spec.md:1262-1294` - FAB
  - `02-frontend-spec.md:1384-1504` - Snackbar

  **Acceptance Criteria**:
  - [ ] Tab switching works
  - [ ] FAB opens add task sheet
  - [ ] Snackbar shows undo option
  - [ ] "Отменить всё" when 2+ pending

  **Commit**: YES
  - Message: `feat(frontend): add TabBar, FAB, Snackbar`
  - Files: `frontend/src/components/TabBar.tsx, FloatingActionButton.tsx, Snackbar.tsx`

---

- [ ] 3.9. Focus Tab Assembly

  **What to do**:
  - Create `frontend/src/screens/FocusTab.tsx`:
    - Combines InboxStack + TodayList
    - Section headers
  - Update `App.tsx`:
    - Tab switching between Focus and Shelves (placeholder)

  **Parallelizable**: NO (depends on 3.8)

  **References**:
  - `02-frontend-spec.md:1594-1634` - Focus tab wireframe

  **Acceptance Criteria**:
  - [ ] Inbox section shows above Today
  - [ ] Both sections work together
  - [ ] Tab bar switches views

  **Commit**: YES
  - Message: `feat(frontend): assemble Focus tab`
  - Files: `frontend/src/screens/FocusTab.tsx, App.tsx`

---

### STAGE 4: Mini App Full

> **Purpose**: Complete Shelves tab, all sheets, animations, empty states.

---

- [ ] 4.1. Shelves Tab

  **What to do**:
  - Create `frontend/src/screens/ShelvesTab.tsx`:
    - Header with settings button
    - Search bar
    - Folder list (system folders only)
    - Archive/Trash rows
  - Create `frontend/src/components/SearchBar.tsx`:
    - Text-based highlight (no dangerouslySetInnerHTML)

  **Must NOT do**:
  - Don't add custom folders (no backend)
  - Don't add Stories carousel yet (Stage 6)

  **Parallelizable**: NO (first Stage 4 task)

  **References**:
  - `02-frontend-spec.md:1636-1756` - Shelves tab wireframe
  - `audit_fixes.md:412-436` - XSS-safe search highlight

  **Acceptance Criteria**:
  - [ ] System folders (work, personal, ideas, media, notes) shown
  - [ ] Search finds tasks by content
  - [ ] Highlight is text-based, not innerHTML

  **Commit**: YES
  - Message: `feat(frontend): add Shelves tab with search`
  - Files: `frontend/src/screens/ShelvesTab.tsx, components/SearchBar.tsx`

---

- [ ] 4.2. TaskDetailSheet

  **What to do**:
  - Create `frontend/src/components/sheets/TaskDetailSheet.tsx`:
    - Vaul drawer
    - Task content, folder badge
    - Deadline indicator
    - Media attachments
    - Actions: edit, complete, delete

  **Parallelizable**: YES (with 4.3)

  **References**:
  - `02-frontend-spec.md:1759-1842` - Task detail sheet

  **Acceptance Criteria**:
  - [ ] Sheet opens from task tap
  - [ ] All task info displayed
  - [ ] Actions work correctly

  **Commit**: YES
  - Message: `feat(frontend): add TaskDetailSheet`
  - Files: `frontend/src/components/sheets/TaskDetailSheet.tsx`

---

- [ ] 4.3. CalendarSheet (Smart Grid)

  **What to do**:
  - Create `frontend/src/components/sheets/CalendarSheet.tsx`:
    - Quick date buttons (Tomorrow, Friday, Weekend)
    - Quick time buttons (Morning, Afternoon, Evening)
    - Selecting schedules task and moves to active

  **Parallelizable**: YES (with 4.2)

  **References**:
  - `02-frontend-spec.md:1296-1381` - CalendarSheet

  **Acceptance Criteria**:
  - [ ] Quick dates work
  - [ ] Task moves to active after scheduling
  - [ ] Time slots set scheduled_time

  **Commit**: YES
  - Message: `feat(frontend): add CalendarSheet with smart grid`
  - Files: `frontend/src/components/sheets/CalendarSheet.tsx`

---

- [ ] 4.4. AddTaskSheet

  **What to do**:
  - Create `frontend/src/components/sheets/AddTaskSheet.tsx`:
    - Text input
    - Folder picker
    - Optional deadline
    - Creates task directly in active (not inbox)

  **Parallelizable**: YES (with 4.5)

  **References**:
  - `02-frontend-spec.md` (implied, not detailed)

  **Acceptance Criteria**:
  - [ ] Opens from FAB
  - [ ] Creates task via API
  - [ ] Closes on success

  **Commit**: YES
  - Message: `feat(frontend): add AddTaskSheet`
  - Files: `frontend/src/components/sheets/AddTaskSheet.tsx`

---

- [ ] 4.5. SettingsSheet

  **What to do**:
  - Create `frontend/src/components/sheets/SettingsSheet.tsx`:
    - Timezone (readonly, from Telegram)
    - Morning digest time picker
    - Deadline reminder minutes
    - Notifications toggle
    - AI classification toggle
    - Google Calendar connect button (Stage 6)
    - Delete account link

  **Parallelizable**: YES (with 4.4)

  **References**:
  - `02-frontend-spec.md:1876-1964` - Settings sheet

  **Acceptance Criteria**:
  - [ ] Settings save via PATCH /me/settings
  - [ ] Calendar connect shows placeholder for Stage 6

  **Commit**: YES
  - Message: `feat(frontend): add SettingsSheet`
  - Files: `frontend/src/components/sheets/SettingsSheet.tsx`

---

- [ ] 4.6. NoteCard + Notes Folder

  **What to do**:
  - Create `frontend/src/components/NoteCard.tsx`:
    - Different from TaskRow
    - No deadline
    - Optional checkbox on long-press
  - Create `frontend/src/components/NotesFolderView.tsx`:
    - List of notes
    - Empty state

  **Parallelizable**: NO (depends on 4.1)

  **References**:
  - `02-frontend-spec.md:1068-1214` - NoteCard and NotesFolderView

  **Acceptance Criteria**:
  - [ ] Notes render differently than tasks
  - [ ] Long-press reveals checkbox
  - [ ] Empty state shows tip

  **Commit**: YES
  - Message: `feat(frontend): add NoteCard and NotesFolderView`
  - Files: `frontend/src/components/NoteCard.tsx, NotesFolderView.tsx`

---

- [ ] 4.7. CompletedTasksView

  **What to do**:
  - Create `frontend/src/components/CompletedTasksView.tsx`:
    - Groups by day
    - Restore button
    - Auto-archive notice

  **Parallelizable**: YES (with 4.6)

  **References**:
  - `02-frontend-spec.md:1506-1590` - CompletedTasksView

  **Acceptance Criteria**:
  - [ ] Shows completed tasks grouped by day
  - [ ] Restore moves back to active

  **Commit**: YES
  - Message: `feat(frontend): add CompletedTasksView`
  - Files: `frontend/src/components/CompletedTasksView.tsx`

---

- [ ] 4.8. DeadlineIndicator + FolderBadge

  **What to do**:
  - Create `frontend/src/components/DeadlineIndicator.tsx`:
    - Color-coded (overdue, today, tomorrow, future)
  - Create `frontend/src/components/FolderBadge.tsx`:
    - Emoji + color per folder

  **Parallelizable**: YES (can be done earlier)

  **References**:
  - `02-frontend-spec.md:1030-1066` - DeadlineIndicator

  **Acceptance Criteria**:
  - [ ] Overdue shows red
  - [ ] Today shows orange
  - [ ] Folder shows correct emoji

  **Commit**: YES
  - Message: `feat(frontend): add DeadlineIndicator and FolderBadge`
  - Files: `frontend/src/components/DeadlineIndicator.tsx, FolderBadge.tsx`

---

- [ ] 4.9. Polish and Empty States

  **What to do**:
  - Add loading skeletons to all lists
  - Add empty states to all sections
  - Add error boundaries
  - Test all touch targets are 44x44

  **Parallelizable**: NO (depends on all 4.x)

  **References**:
  - `audit_fixes.md:1015-1030` - Loading/empty states

  **Acceptance Criteria**:
  - [ ] Every list has loading skeleton
  - [ ] Every empty list has friendly message
  - [ ] Error boundary catches crashes

  **Commit**: YES
  - Message: `feat(frontend): add loading skeletons and empty states`
  - Files: multiple

---

### STAGE 5: Background Jobs

> **Purpose**: Sunset, Mixer, notifications, cleanup. App is fully autonomous.

---

- [ ] 5.1. TDD: Sunset Engine

  **What to do**:
  - Create `src/__tests__/sunset.test.ts`:
    ```typescript
    describe('Sunset Engine', () => {
      it('archives tasks inactive for 30 days', ...);
      it('excludes notes from archival', ...);
      it('excludes ideas from archival', ...);
      it('excludes tasks with deadlines', ...);
      it('excludes recently edited tasks', ...);
      it('stores notification count for ghost trail', ...);
    });
    ```
  - RED: Tests fail
  - Create `src/jobs/sunset.ts`
  - GREEN: Tests pass

  **Parallelizable**: YES (with 5.2)

  **References**:
  - `01-backend-spec.md:1279-1337` - Sunset engine

  **Acceptance Criteria**:
  - [ ] Tests verify all exclusion rules
  - [ ] Transaction wraps batch archive
  - [ ] Ghost trail count stored

  **Commit**: YES
  - Message: `feat(jobs): add Sunset engine with TDD`
  - Files: `src/jobs/sunset.ts, src/__tests__/sunset.test.ts`

---

- [ ] 5.2. TDD: Mixer Engine

  **What to do**:
  - Create `src/__tests__/mixer.test.ts`:
    ```typescript
    describe('Mixer Engine', () => {
      it('resurfaces up to 5 tasks from backlog', ...);
      it('runs only once per 24 hours', ...);
      it('excludes notes', ...);
      it('excludes ideas', ...);
      it('respects 14-day cooldown', ...);
    });
    ```
  - RED: Tests fail
  - Create `src/jobs/mixer.ts`
  - GREEN: Tests pass

  **Parallelizable**: YES (with 5.1)

  **References**:
  - `01-backend-spec.md:1229-1274` - Mixer engine

  **Acceptance Criteria**:
  - [ ] Max 5 tasks per run
  - [ ] 24h idempotency
  - [ ] Notes excluded

  **Commit**: YES
  - Message: `feat(jobs): add Mixer engine with TDD`
  - Files: `src/jobs/mixer.ts, src/__tests__/mixer.test.ts`

---

- [ ] 5.3. Media Queue Processor

  **What to do**:
  - Create `src/jobs/mediaQueue.ts`:
    - Poll pending jobs every 1s
    - Process transcription with Whisper
    - Retry with exponential backoff (1s, 2s, 4s)
    - Fallback text on failure
    - Rate limit: 5 jobs/user/min
  - Create `src/jobs/startup.ts`:
    - `recoverStuckJobs()` on server start

  **Parallelizable**: NO (depends on 5.1, 5.2)

  **References**:
  - `01-backend-spec.md:1686-1746` - Queue implementation
  - `01-backend-spec.md:1536-1555` - Server startup recovery

  **Acceptance Criteria**:
  - [ ] Jobs process in order
  - [ ] Retry happens 3 times
  - [ ] Fallback text applied on failure
  - [ ] Stuck jobs recover on restart

  **Commit**: YES
  - Message: `feat(jobs): add media queue processor with retry`
  - Files: `src/jobs/mediaQueue.ts, src/jobs/startup.ts`

---

- [ ] 5.4. Notification Jobs

  **What to do**:
  - Create `src/jobs/notifications.ts`:
    - Morning digest cron (per user timezone)
    - Deadline reminder cron
    - Mark `deadline_notified` to prevent spam
  - Handle bot-blocked gracefully

  **Parallelizable**: NO (depends on 5.3)

  **References**:
  - `01-backend-spec.md:1341-1416` - Notification crons
  - `03-bot-spec.md:757-862` - Notification functions

  **Acceptance Criteria**:
  - [ ] Digest sends at user's morning time
  - [ ] Reminder fires once per deadline
  - [ ] Bot-blocked disables notifications

  **Commit**: YES
  - Message: `feat(jobs): add notification crons`
  - Files: `src/jobs/notifications.ts`

---

- [ ] 5.5. Cleanup Jobs

  **What to do**:
  - Create `src/jobs/cleanup.ts`:
    - Trash purge: delete tasks >90 days in deleted
    - Orphan files: delete files not in media table
    - Queue cleanup: delete completed jobs >7 days
    - Done auto-archive: archive done tasks >7 days

  **Parallelizable**: NO (depends on 5.4)

  **References**:
  - `01-backend-spec.md:1449-1528` - Cleanup jobs

  **Acceptance Criteria**:
  - [ ] Trash purge deletes files too
  - [ ] Orphan cleanup has 1h grace period
  - [ ] No errors on empty tables

  **Commit**: YES
  - Message: `feat(jobs): add cleanup crons`
  - Files: `src/jobs/cleanup.ts`

---

- [ ] 5.6. Cron Registration

  **What to do**:
  - Create `src/jobs/index.ts`:
    - Register all crons with croner
    - Log cron starts/completions
  - Update `src/index.ts`:
    - Call job registration on startup
    - Run recovery for stuck jobs

  **Parallelizable**: NO (depends on all 5.x)

  **References**:
  - `01-backend-spec.md:1280` - Cron schedule examples

  **Acceptance Criteria**:
  - [ ] All crons registered
  - [ ] Logs show cron activity
  - [ ] `bun run dev` starts crons

  **Commit**: YES
  - Message: `feat(jobs): register all background crons`
  - Files: `src/jobs/index.ts, src/index.ts`

---

### STAGE 6: Integrations (OPTIONAL)

> **Purpose**: Google Calendar sync, Stories carousel. Nice-to-have features.

---

- [ ] 6.1. Google OAuth Flow

  **What to do**:
  - Create `src/api/routes/calendar.ts`:
    - `GET /calendar/connect` → redirect to Google OAuth
    - `GET /calendar/callback` → exchange code for tokens
    - `DELETE /calendar/disconnect` → revoke tokens
  - Store tokens in users table

  **Parallelizable**: NO (first Stage 6 task)

  **References**:
  - `01-backend-spec.md:1073-1103` - Calendar endpoints

  **Acceptance Criteria**:
  - [ ] OAuth flow works end-to-end
  - [ ] Tokens stored securely
  - [ ] Disconnect revokes tokens

  **Commit**: YES
  - Message: `feat(api): add Google Calendar OAuth flow`
  - Files: `src/api/routes/calendar.ts`

---

- [ ] 6.2. Calendar Sync Job

  **What to do**:
  - Create `src/jobs/calendarSync.ts`:
    - Sync tasks with deadlines to Google Calendar
    - Two-way sync: update google_event_id
    - Token refresh with retry
    - Disable sync on repeated failures

  **Parallelizable**: NO (depends on 6.1)

  **References**:
  - `audit_fixes.md:950-960` - Calendar sync retry + backoff

  **Acceptance Criteria**:
  - [ ] Task with deadline creates calendar event
  - [ ] Token refresh works
  - [ ] 3 failures → sync disabled

  **Commit**: YES
  - Message: `feat(jobs): add Google Calendar sync`
  - Files: `src/jobs/calendarSync.ts`

---

- [ ] 6.3. Stories Carousel

  **What to do**:
  - Create `frontend/src/components/StoriesCarousel.tsx`:
    - Shows on Tuesday and Friday only
    - Displays ideas from ideas folder
    - Horizontal scroll
  - Create story notification cron

  **Parallelizable**: YES (with 6.2)

  **References**:
  - `02-frontend-spec.md:1764-1798` - Stories carousel
  - `03-bot-spec.md:898-914` - Stories notification

  **Acceptance Criteria**:
  - [ ] Shows only on Tue/Fri
  - [ ] Displays idea cards
  - [ ] Bot sends reminder

  **Commit**: YES
  - Message: `feat: add Stories carousel`
  - Files: `frontend/src/components/StoriesCarousel.tsx, src/jobs/notifications.ts`

---

- [ ] 6.4. Frontend Calendar Integration

  **What to do**:
  - Update SettingsSheet:
    - Connect button triggers OAuth
    - Show connected state
    - Disconnect button
  - Show google_event_id indicator on tasks

  **Parallelizable**: NO (depends on 6.1)

  **References**:
  - `02-frontend-spec.md:1919-1938` - Calendar settings

  **Acceptance Criteria**:
  - [ ] Connect opens Google OAuth
  - [ ] Connected tasks show calendar icon
  - [ ] Disconnect clears tokens

  **Commit**: YES
  - Message: `feat(frontend): add Google Calendar settings`
  - Files: `frontend/src/components/sheets/SettingsSheet.tsx`

---

## Commit Strategy

| After Task | Message Pattern | Verification |
|------------|-----------------|--------------|
| 0.x | `chore:` | Manual verification |
| 1.x | `feat(db/api):` | `bun test` |
| 2.x | `feat(bot):` | Bot responds to messages |
| 3.x | `feat(frontend):` | App opens in Telegram |
| 4.x | `feat(frontend):` | All features work |
| 5.x | `feat(jobs):` | `bun test` |
| 6.x | `feat:` | Integration works |

---

## Success Criteria

### Verification Commands
```bash
# Backend tests
bun test

# Start dev server
bun run dev

# Frontend dev
cd frontend && bun run dev

# Health check
curl http://localhost:3000/health
```

### Final Checklist
- [ ] Bot responds with ✓ to valid messages
- [ ] Bot responds with ❌ to errors
- [ ] Mini App opens from bot menu button
- [ ] Swipe cards work in all 4 directions
- [ ] Undo cancels completion timer
- [ ] Sunset archives stale tasks (excluding notes/ideas)
- [ ] Mixer resurfaces backlog tasks
- [ ] All tests pass
- [ ] No snake_case in API responses
- [ ] No tokens exposed in /me
- [ ] All timestamps in milliseconds
