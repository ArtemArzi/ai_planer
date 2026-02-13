# Learnings

## 2026-02-05 Session Start
- Project: LAZY FLOW - Telegram-native task manager
- Tech: Bun + Hono + SQLite + grammY + React + Vite
- Philosophy: "Capture = Exhale, Review = Inhale" - minimal cognitive load

## Task 0.1: Project Scaffold (Completed)

### Successful Approaches
- Bun 1.3.5 installed and working correctly
- `bun init -y` automatically created initial project structure with TypeScript support
- All dependencies installed successfully:
  - Production: hono@4.11.7, grammy@1.39.3, croner@10.0.1, openai@6.18.0
  - Dev: @types/bun@latest, typescript@5.9.3
- Directory structure created as specified with .gitkeep files for version control

### Configuration Details
- tsconfig.json configured with strict mode and bundler module resolution
- bunfig.toml set to disable peer dependency warnings
- .env.example includes all required environment variables for bot, webhook, and OpenAI integration

### Project Structure Verified
```
/home/artem/planer/
├── src/
│   ├── api/           # Hono REST API
│   ├── bot/           # grammY bot
│   ├── db/            # SQLite setup, migrations
│   ├── lib/           # Shared utilities
│   ├── jobs/          # Background crons
│   └── __tests__/     # Test files
└── uploads/           # User media files
```

### Notes
- Bun automatically added @types/bun and typescript during init
- No git initialization needed (may already exist or will be done separately)
- Ready for Stage 1 implementation (Database Schema & Models)

## 2026-02-06 Frontend Scaffold Note
- Repo guidance in `CLAUDE.md` says: use Bun HTML imports with `Bun.serve()` and avoid Vite.
- Plan/spec references Vite; will follow repo guidance to avoid Vite in Stage 3 scaffold.

## 2026-02-06 Task 3.1 Completed
- Frontend scaffold exists in `frontend/` with Bun HTML imports: `index.html`, `dev.ts`, `src/main.tsx`, `src/App.tsx`, `src/index.css`.
- Tailwind and PostCSS configs are present: `frontend/tailwind.config.ts`, `frontend/postcss.config.js`.
- Required directories created: `frontend/src/providers`, `frontend/src/stores`, `frontend/src/api`, `frontend/src/components`, `frontend/src/hooks`.
- Verified script and deps in `frontend/package.json`, including `"dev": "bun --hot ./dev.ts"` and required libraries.
- Verification evidence: `ss` showed `LISTEN` on `*:5173` while running `bun run dev`; LSP diagnostics clean for `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/tailwind.config.ts`.

## 2026-02-06 Task 3.2 Completed
- Added SDK v2 provider: `frontend/src/providers/TelegramProvider.tsx` with `init()`, `miniApp.mount()`, `miniApp.ready()`, `themeParams.bindCssVars()`, `viewport.mount()`, `viewport.bindCssVars()`, `viewport.expand()`.
- Added hooks: `frontend/src/hooks/useHaptic.ts` and `frontend/src/hooks/useBackButton.ts` using v2 API and `useSignal(backButton.isVisible)`.
- Wired provider in `frontend/src/main.tsx`.
- Updated Telegram theme variable mapping to official names in `frontend/tailwind.config.ts` and `frontend/src/index.css`.
- Verification evidence: `bun install` success in `frontend/`; LSP diagnostics clean for changed TS/TSX files; `ss` confirmed dev server listens on `*:5173` when running `bun run dev`.

## 2026-02-06 Task 3.3 Completed
- Added API wrapper `frontend/src/api/client.ts` with Telegram auth header `X-Telegram-Init-Data` via `retrieveLaunchParams().initDataRaw`.
- Added 401 interception with `window` event `lazyflow:session-expired`.
- Added persistent Query client in `frontend/src/api/queryClient.ts` using:
  - `@tanstack/react-query-persist-client`
  - `@tanstack/query-sync-storage-persister`
  - localStorage key `lazyflow-query-cache`.
- Added task hooks in `frontend/src/api/tasks.ts`: `useTasks`, `useInboxTasks`, `useTodayTasks`, `useUpdateTask` with optimistic update and rollback.
- Wired shared query client in `frontend/src/main.tsx`.
- Verification evidence: dependency install success, LSP diagnostics clean on changed files, frontend dev server listens on `*:5173`.

## 2026-02-06 Task 3.4 Completed
- Added `frontend/src/stores/uiStore.ts` with:
  - `activeTab` state (`focus` / `shelves`)
  - undo queue `pendingUndos: Map<string, UndoAction>` and `latestUndoTaskId`
  - swipe state (`swipingTaskId`, `swipeDirection`)
  - sheet state (`openSheet`, `selectedTaskId`) and open/close actions
  - sunset counter state
- Implemented timer-aware undo methods:
  - `addPendingUndo`
  - `removePendingUndo` (cancels timer)
  - `clearAllPendingUndos` (cancels all timers)
- Added `beforeunload` handler to commit only elapsed undo actions (`>= 2000ms`) via `sendBeacon`.
- Verification evidence: LSP diagnostics clean for `frontend/src/stores/uiStore.ts`; dev server still starts on `*:5173`.

## 2026-02-06 Task 3.5 Completed
- Added `frontend/src/components/ConfirmSheet.tsx` using Vaul drawer for destructive action confirmation.
- Added `frontend/src/components/SwipeCard.tsx` with:
  - 4-direction swipe detection (left/right/up/down)
  - direction lock threshold logic
  - motion overlays with Lucide icons
  - haptic feedback integration
  - down-swipe opens custom confirmation sheet (no `window.confirm`).
- Verification evidence: LSP diagnostics clean for new component files; dev server still listens on `*:5173`.

## 2026-02-06 Task 3.6 Completed
- Added `frontend/src/components/CardStack.tsx`:
  - 3 visible cards (top + 2 preview)
  - spring animation for stack scale/offset
  - `AnimatePresence` transitions on card removal.
- Added `frontend/src/components/InboxStack.tsx`:
  - loading skeleton section
  - empty state section with CTA text
  - one-time swipe coachmark using `localStorage` key `swipe_hint_shown`
  - bulk postpone action for overflow (`>10`) and swipe handling for all 4 directions.
- Updated `frontend/src/api/tasks.ts` with `useBatchUpdateTasks` helper for future use.
- Verification evidence: dev server launches on `*:5173`; diagnostics clean on `CardStack.tsx` and `tasks.ts`.

## 2026-02-06 Task 3.7 Completed
- Added `frontend/src/components/TaskRow.tsx`:
  - checkbox with min 44x44 touch target
  - 2-second completion timer before status update to `done`
  - celebration class trigger and line-through state
  - timer cancellation path through undo queue (`removePendingUndo`).
- Added `frontend/src/components/TodayList.tsx`:
  - sorted tasks via `useTodayTasks()`
  - loading skeleton and empty state sections
  - list rendering with `TaskRow` items.
- Verification evidence:
  - `bunx tsc --noEmit ... TaskRow/TodayList/uiStore` passed
  - `bunx tsc --noEmit ... InboxStack/CardStack/SwipeCard/tasks` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 3.8 Completed
- Added `frontend/src/components/TabBar.tsx` with Focus/Shelves tabs and safe-area bottom padding.
- Added `frontend/src/components/FloatingActionButton.tsx` (`+`) hidden when any sheet is open.
- Added `frontend/src/components/Snackbar.tsx` for latest undo action and `Отменить все` when 2+ pending undos.
- Verification evidence:
  - `bunx tsc --noEmit ...` for Stage 3 components passed
  - LSP diagnostics clean for new files
  - dev server listens on `*:5173`.

## 2026-02-06 Task 3.9 Completed
- Added `frontend/src/screens/FocusTab.tsx` combining `InboxStack` and `TodayList`.
- Updated `frontend/src/App.tsx`:
  - tab switch between Focus and Shelves placeholder using `activeTab` from store
  - global UI shell now includes `FloatingActionButton`, `Snackbar`, and `TabBar`.
- Verification evidence:
  - LSP diagnostics clean for `App.tsx` and `FocusTab.tsx`
  - full Stage 3 type-check command passed (`bunx tsc --noEmit ...`)
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.1 Completed
- Added `frontend/src/components/SearchBar.tsx` with safe text highlight utility (`highlightText`) using string splitting (no `dangerouslySetInnerHTML`).
- Added `frontend/src/screens/ShelvesTab.tsx` with:
  - header + settings icon button
  - search section and highlighted results list
  - system folders only (work/personal/ideas/media/notes)
  - archive and trash rows.
- Updated `frontend/src/App.tsx` to render real `ShelvesTab` instead of placeholder.
- Verification evidence:
  - `bunx tsc --noEmit ... ShelvesTab/App/uiStore` passed
  - full Stage 3-4 type-check command passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.2 Completed
- Added `frontend/src/components/sheets/TaskDetailSheet.tsx` with Vaul drawer UI.
- Implemented detail rendering for selected task: content, folder/type chips, deadline, attachments placeholder.
- Added action callbacks/buttons for edit, complete, delete.
- Verification evidence:
  - LSP diagnostics clean for `TaskDetailSheet.tsx`
  - `bunx tsc --noEmit ... TaskDetailSheet.tsx` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.3 Completed
- Added `frontend/src/components/sheets/CalendarSheet.tsx` with Vaul drawer.
- Implemented Smart Grid quick actions:
  - dates: Tomorrow / Friday / Weekend
  - times: Morning / Afternoon / Evening
- Selecting time schedules task via `useUpdateTask` and moves it to `active` with computed `deadline` timestamp.
- Verification evidence:
  - LSP diagnostics clean for `CalendarSheet.tsx`
  - `bunx tsc --noEmit ... CalendarSheet.tsx` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.4 Completed
- Added create mutation `useCreateTask` in `frontend/src/api/tasks.ts`.
- Added `frontend/src/components/sheets/AddTaskSheet.tsx`:
  - content input
  - folder picker
  - optional datetime deadline
  - creates task in `active` status.
- Wired sheet into `frontend/src/App.tsx` using UI store `openSheet === "addTask"` and FAB open flow.
- Verification evidence:
  - `bunx tsc --noEmit ... AddTaskSheet/App/tasks` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.5 Completed
- Added users API hooks in `frontend/src/api/users.ts`:
  - `useMe`
  - `useUpdateSettings`
  - compatibility fallback for backend `/me/me*` route shape.
- Added `frontend/src/components/sheets/SettingsSheet.tsx` with:
  - timezone readonly field
  - morning digest time
  - deadline reminder minutes
  - toggles: notifications, AI classification, stories
  - Google Calendar placeholder button for Stage 6
  - delete account placeholder button.
- Wired settings flow:
  - `frontend/src/screens/ShelvesTab.tsx` settings button opens `openSheet="settings"`
  - `frontend/src/App.tsx` renders `SettingsSheet` when open.
- Verification evidence:
  - `bunx tsc --noEmit ... users/SettingsSheet/ShelvesTab/App` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.6 Completed
- Added `frontend/src/components/NoteCard.tsx` with note-specific styling and long-press checkbox reveal behavior.
- Added `frontend/src/components/NotesFolderView.tsx` with notes list rendering and friendly empty state tip.
- Verification evidence:
  - LSP diagnostics clean for notes components
  - `bunx tsc --noEmit ... NoteCard/NotesFolderView` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.7 Completed
- Added `frontend/src/components/CompletedTasksView.tsx`:
  - groups done tasks by day
  - shows auto-archive notice
  - supports restoring task back to `active`.
- Verification evidence:
  - LSP diagnostics clean for `CompletedTasksView.tsx`
  - `bunx tsc --noEmit ... CompletedTasksView.tsx` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.8 Completed
- Added `frontend/src/components/DeadlineIndicator.tsx` with status-based color coding:
  - overdue (red)
  - today (orange)
  - tomorrow (yellow)
  - future (hint).
- Added `frontend/src/components/FolderBadge.tsx` with emoji/color mapping by folder.
- Integrated into existing UI:
  - `TaskRow.tsx` now uses `DeadlineIndicator` and `FolderBadge`
  - `SwipeCard.tsx` now uses `FolderBadge` and `DeadlineIndicator`.
- Verification evidence:
  - `bunx tsc --noEmit ... DeadlineIndicator/FolderBadge/TaskRow/SwipeCard` passed
  - dev server listens on `*:5173`.

## 2026-02-06 Task 4.9 Completed
- Added global `ErrorBoundary` (`frontend/src/components/ErrorBoundary.tsx`) and wrapped app in `frontend/src/main.tsx`.
- Added additional loading skeleton handling in `ShelvesTab` and ensured empty states are present across key sections (Inbox, Today, Notes, Completed, Shelves search).
- Updated snackbar action buttons to 44px touch-height.
- Verification evidence:
  - LSP diagnostics clean for core Stage 4 touched files (`ErrorBoundary`, `main`, `Snackbar`)
  - full frontend type-check command passed (`bunx tsc --noEmit ...`)
  - dev server listens on `*:5173`.

## 2026-02-06 Task 5.1 Completed
- Added `src/jobs/sunset.ts` with transactional sunset engine logic:
  - archives stale `active` tasks only
  - excludes ideas, notes, tasks with deadlines, and recently edited tasks
  - increments `sunset_notifications.archived_count` per user and resets `shown=0`.
- Added TDD file `src/__tests__/sunset.test.ts` with 6 cases:
  - archives tasks inactive for 30 days
  - excludes notes
  - excludes ideas
  - excludes tasks with deadlines
  - excludes recently edited tasks
  - stores ghost trail notification counts.
- Verification evidence:
  - LSP diagnostics clean for `src/jobs/sunset.ts` and `src/__tests__/sunset.test.ts`
  - `bun test` passed: 30 tests, 0 failures.

## 2026-02-06 Task 5.2 Completed
- Added `src/jobs/mixer.ts` implementing Mixer engine:
  - per-user 24h idempotency based on `users.last_mixer_run`
  - selects from backlog only, excludes notes and ideas
  - respects 14-day cooldown via `last_seen_at`
  - resurfaces max 5 tasks to inbox and marks `is_mixer_resurfaced=1`.
- Added `src/__tests__/mixer.test.ts` with 5 TDD cases:
  - resurfaces up to 5
  - once per 24h
  - excludes notes
  - excludes ideas
  - enforces 14-day cooldown.
- Verification evidence:
  - LSP diagnostics clean for new mixer files
  - `bun test` passed: 35 tests, 0 failures.

## 2026-02-06 Task 5.3 Completed
- Added `src/jobs/mediaQueue.ts`:
  - queue polling worker (`processNextMediaQueueJob`)
  - per-user rate limit handling
  - retry/backoff logic (1s, 2s, 4s)
  - fallback transcription content after max attempts
  - transcription flow with Whisper (`whisper-1`) and timeout.
- Added `src/jobs/startup.ts` with `recoverStuckJobs()` for startup recovery of processing jobs.
- Verification evidence:
  - LSP diagnostics clean for `mediaQueue.ts` and `startup.ts`
  - `bun test` passed: 35 tests, 0 failures.

## 2026-02-06 Task 5.4 Completed
- Added `src/jobs/notifications.ts`:
  - `runMorningDigest()` with per-user timezone matching and digest generation
  - `runDeadlineReminders()` with one-time reminder via `deadline_notified`
  - bot-blocked detection and automatic `notifications_enabled=0` fallback.
- Verification evidence:
  - LSP diagnostics clean for `notifications.ts`
  - `bun test` passed: 35 tests, 0 failures.

## 2026-02-06 Task 5.5 Completed
- Fixed Bun/TypeScript `Dirent` generic mismatch in `src/jobs/cleanup.ts` by switching recursive file walk to string-based `readdir()` + per-path `stat()` checks.
- Cleanup job behavior remains unchanged:
  - purge deleted tasks older than 90 days and unlink related files
  - orphan file cleanup with 1h grace period
  - cleanup completed/failed queue jobs older than 7 days
  - auto-archive done tasks older than 7 days.
- Verification evidence:
  - LSP diagnostics clean for `src/jobs/cleanup.ts`
  - `bunx tsc --noEmit` passed
  - `bun test` passed: 35 tests, 0 failures.

## 2026-02-06 Task 5.6 Completed
- Added cron/job orchestrator in `src/jobs/index.ts` with:
  - startup recovery (`recoverStuckJobs`) + media queue processor start
  - cron registration for sunset, morning digest, deadline reminders, daily cleanup, weekly orphan file cleanup
  - per-job start/completion/failure logging wrappers.
- Integrated job bootstrap into server startup via `src/index.ts` (`registerBackgroundJobs()`).
- Verification evidence:
  - LSP diagnostics clean for `src/jobs/index.ts` and `src/index.ts`
  - `bunx tsc --noEmit` passed
  - `bun test` passed: 35 tests, 0 failures.

## 2026-02-09 Product Logic v2 (Wave 1+2 Implementation)
- Added recurrence support end-to-end:
  - schema + migration path (`recurrence_rule`)
  - DTO/row mappings and CRUD plumbing
  - completion-time auto-clone in tasks API.
- Added date-aware visibility:
  - `getTasks({ forDate })` excludes future `scheduled_date`
  - new `GET /tasks/upcoming` endpoint returns active future-dated tasks.
- Added multi-capture parsing:
  - `splitMultiCapture()` in capture layer
  - bot handler loops over parsed items and replies `✓ × N` for batch capture.
- Frontend updates:
  - CalendarSheet now sets `scheduledDate` + `scheduledTime`
  - `useTodayTasks()` now requests `forDate=today`
  - Added collapsible `UpcomingList` section in Focus tab.
- Verification evidence:
  - `bun test` passed (includes new `multi-capture.test.ts` and `recurring.test.ts`)
  - LSP diagnostics clean on changed TS/TSX files
  - endpoint smoke checks via `bun -e`:
    - `/tasks?status=active&forDate=...` returns filtered tasks
    - `/tasks/upcoming` returns future tasks
    - completing recurring task creates next occurrence.
