# LAZY FLOW v2: Product Logic Implementation Plan

> **Goals**: (A) Inbox/Today/Archive lifecycle clarity, (B) Future-dated task visibility, (C) Recurring tasks, (D) Multi-capture parsing

---

## TL;DR

> **Quick Summary**: Implement 4 product-logic features with minimal schema changes—add `scheduled_date` semantics, `recurrence_rule` column, and `splitMultiCapture()` parser in bot.
> 
> **Deliverables**:
> - Clear lifecycle: Inbox → Today (active) → Done → Archive
> - "Upcoming" section for future-dated tasks (not in Today)
> - Daily recurring tasks with simple `recurrence_rule` column
> - Multi-task capture parser: "task1; task2; task3" creates 3 tasks
> 
> **Estimated Effort**: Medium (3-5 days)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Schema → Backend Logic → Frontend

---

## Context

### Original Request
Implement 4 product-logic improvements for LAZY FLOW:
1. **Lifecycle Clarity**: Make Inbox/Today/Archive flow intuitive
2. **Future-Dated Visibility**: Show upcoming tasks without cluttering Today
3. **Recurring Tasks**: Daily habits that reappear predictably
4. **Multi-Capture**: Parse "task1; task2; task3" into separate tasks

### Current State Analysis

**From codebase evidence:**

| Aspect | Current Implementation | File Reference |
|--------|----------------------|----------------|
| **Statuses** | `inbox`, `active`, `backlog`, `done`, `archived`, `deleted` | `src/lib/types.ts:6` |
| **Scheduling** | `deadline` (ms), `scheduled_date` (YYYY-MM-DD), `scheduled_time` (HH:MM) exist but `scheduled_date` unused | `src/db/schema.sql:59-61` |
| **Today Logic** | `useTodayTasks()` = just `status: 'active'`, no date filtering | `frontend/src/api/tasks.ts:108-134` |
| **Capture** | Single message → single task, no splitting | `src/lib/capture.ts:18-92` |
| **Recurring** | None—Mixer resurfaces from backlog, not true recurrence | `src/jobs/mixer.ts` |
| **Frontend** | FocusTab = InboxStack + TodayList, no Upcoming section | `frontend/src/screens/FocusTab.tsx` |

### Key Gaps Identified

1. **Lifecycle Confusion**: `active` = "Today" but future-dated tasks also `active`
2. **No `scheduled_date` usage**: Column exists but CalendarSheet only sets `deadline`
3. **No recurrence**: Mixer is random backlog resurfacing, not scheduled repeats
4. **Single-task capture**: Bot creates 1 task per message regardless of content

---

## Architecture Decisions

### Decision 1: Use `scheduled_date` for Future Visibility

**Choice**: Repurpose existing `scheduled_date` column (currently unused)

**Rationale**: 
- Column already exists in schema (`src/db/schema.sql:60`)
- Already mapped in `rowToDTO()` (`src/db/tasks.ts:15`)
- Zero schema migration needed

**Behavior**:
- Task with `scheduledDate = '2025-02-15'` and `status = 'active'`:
  - If `scheduledDate < today` → appears in Today
  - If `scheduledDate > today` → appears in Upcoming
  - If `scheduledDate == today` → appears in Today
- Task with `scheduledDate = null` and `status = 'active'` → appears in Today (backward compatible)

### Decision 2: Simple Recurrence via `recurrence_rule` Column

**Choice**: Add single `recurrence_rule TEXT` column with values: `'daily'`, `'weekdays'`, `'weekly'`, `null`

**Rationale**:
- KISS principle—no RFC 5545 RRULE complexity for MVP
- Daily habits are 90% of recurring task use cases
- Easier to implement and understand

**Behavior**:
- When recurring task marked `done`:
  1. Keep original task as `done` (for history)
  2. Create clone with `scheduledDate = nextOccurrence(rule)`
  3. Clone has `status = 'active'`, appears in Upcoming until that date

### Decision 3: Semicolon-Delimited Multi-Capture

**Choice**: Split on `;` or newlines, apply capture logic per item

**Rationale**:
- Natural language: "buy milk; call mom; send invoice"
- Newlines support: Telegram message with multiple lines
- Per-item tag support: "#w fix bug; #p call doctor"

**Behavior**:
- Input: `#w fix bug; #p call doctor; buy milk`
- Output: 3 tasks with folders `work`, `personal`, `personal` (AI fallback for 3rd)

### Decision 4: Lifecycle States Remain Unchanged

**Choice**: Keep existing statuses, clarify their meaning in UI

| Status | Meaning | Where Shown |
|--------|---------|-------------|
| `inbox` | Unsorted, needs triage | InboxStack (swipeable cards) |
| `active` | Committed to do | Today list (if `scheduledDate <= today` or null) / Upcoming (if future) |
| `backlog` | "Maybe later" | Shelves → Backlog folder (NEW UI) |
| `done` | Completed | Archive |
| `archived` | Auto-archived by Sunset | Archive |
| `deleted` | Soft-deleted | Hidden |

---

## Task Dependency Graph

| Task | Depends On | Reason |
|------|------------|--------|
| 1 (Schema) | None | Foundation—adds `recurrence_rule` column |
| 2 (Backend getTasks) | None | Can start in parallel with schema |
| 3 (Multi-capture parser) | None | Independent parsing logic |
| 4 (Bot handler) | 3 | Uses multi-capture parser |
| 5 (Recurring completion) | 1 | Needs `recurrence_rule` column |
| 6 (Frontend Upcoming) | 2 | Needs new API filter |
| 7 (CalendarSheet fix) | None | Independent UI fix |
| 8 (Client Journey) | 6, 7 | Validates full flow |

---

## Parallel Execution Graph

```
Wave 1 (Start immediately):
├── Task 1: Add recurrence_rule column to schema
├── Task 2: Add date-aware getTasks filter + API endpoint
├── Task 3: Implement splitMultiCapture() parser
└── Task 7: Fix CalendarSheet to set scheduledDate

Wave 2 (After Wave 1):
├── Task 4: Update bot message handler for multi-capture
├── Task 5: Implement recurring task completion logic
└── Task 6: Add Upcoming section to FocusTab

Wave 3 (After Wave 2):
└── Task 8: Client Journey validation

Critical Path: Task 2 → Task 6 → Task 8
Parallel Speedup: ~40% faster than sequential
```

## Implementation Status (2026-02-09)

- [x] Task 1 implemented
- [x] Task 2 implemented
- [x] Task 3 implemented
- [x] Task 4 implemented (manual Telegram verification pending)
- [x] Task 5 implemented
- [x] Task 6 implemented (manual UI verification pending)
- [x] Task 7 implemented (manual UI verification pending)
- [ ] Task 8 pending (client-journey screenshots/evidence)

---

## TODOs

### Task 1: Add `recurrence_rule` Column to Schema

**What to do**:
- Add `recurrence_rule TEXT CHECK(recurrence_rule IN ('daily', 'weekdays', 'weekly'))` to tasks table
- Add to TaskRow and TaskDTO types
- Add to rowToDTO transformation
- Add to createTask and updateTask functions

**Must NOT do**:
- Don't add complex RRULE parsing
- Don't add recurrence UI yet (separate task)

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Single-column schema change, straightforward type additions
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: Clean TypeScript type definitions

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: No UI changes in this task

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 2, 3, 7)
- **Blocks**: Task 5
- **Blocked By**: None

**References**:
- `src/db/schema.sql:42-80` — tasks table definition
- `src/lib/types.ts:14-38` — TaskDTO type
- `src/lib/types.ts:79-101` — TaskRow type
- `src/db/tasks.ts:4-28` — rowToDTO function
- `src/db/tasks.ts:30-67` — createTask function
- `src/db/tasks.ts:118-209` — updateTask function

**Acceptance Criteria**:
- [x] `ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT` in schema.sql (or auto-migration)
- [x] `RecurrenceRule = 'daily' | 'weekdays' | 'weekly' | null` type exported
- [x] TaskDTO and TaskRow include `recurrenceRule` / `recurrence_rule`
- [x] Manual: `bun run src/index.ts`, then `sqlite3 data/lazyflow.db ".schema tasks"` shows new column

**Commit**: YES
- Message: `feat(db): add recurrence_rule column for recurring tasks`
- Files: `src/db/schema.sql`, `src/lib/types.ts`, `src/db/tasks.ts`

---

### Task 2: Add Date-Aware getTasks Filter + API Endpoints

**What to do**:
- Extend `getTasks()` in `src/db/tasks.ts` with optional `forDate` parameter
- Add logic: if `forDate` provided, filter tasks where `scheduled_date IS NULL OR scheduled_date <= forDate`
- Add new API query param `?forDate=YYYY-MM-DD` to `/tasks` endpoint
- Add new endpoint `GET /tasks/upcoming` that returns tasks with `scheduledDate > today`

**Must NOT do**:
- Don't change existing query behavior when `forDate` not provided
- Don't add frontend consumption yet

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
  - Reason: Moderate backend logic, SQL + Hono endpoint
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: Clean API patterns

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: Backend-only task

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 3, 7)
- **Blocks**: Task 6
- **Blocked By**: None

**References**:
- `src/db/tasks.ts:85-116` — getTasks() function with filter logic
- `src/api/routes/tasks.ts:12-32` — GET /tasks endpoint
- `src/api/routes/tasks.ts:34-44` — GET /tasks/stats for pattern reference

**Acceptance Criteria**:
- [x] `getTasks({ userId, status: 'active', forDate: '2025-02-09' })` returns only tasks due today or earlier
- [x] `GET /tasks?status=active&forDate=2025-02-09` works via API
- [x] `GET /tasks/upcoming` returns tasks with `scheduledDate > today`, sorted by `scheduledDate ASC`
- [x] Manual: `curl -H "Authorization: ..." "/tasks/upcoming"` returns future-dated tasks only

**Commit**: YES
- Message: `feat(api): add date-aware task filtering and /upcoming endpoint`
- Files: `src/db/tasks.ts`, `src/api/routes/tasks.ts`

---

### Task 3: Implement splitMultiCapture() Parser

**What to do**:
- Create new function `splitMultiCapture(text: string): string[]` in `src/lib/capture.ts`
- Split on `;` or `\n` (semicolon or newline)
- Trim each item, filter empty strings
- Return array of 1-10 items (cap at 10 to prevent abuse)
- Each item should be processed individually through existing `processMessage()`

**Must NOT do**:
- Don't modify `processMessage()` signature
- Don't add AI date extraction (separate feature)

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Simple string parsing function
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: Clean parsing logic

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: Pure backend logic

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 2, 7)
- **Blocks**: Task 4
- **Blocked By**: None

**References**:
- `src/lib/capture.ts:18-92` — processMessage() for context
- `src/__tests__/capture.test.ts` — existing test patterns

**Acceptance Criteria**:
- [x] `splitMultiCapture("task1; task2; task3")` returns `["task1", "task2", "task3"]`
- [x] `splitMultiCapture("#w fix bug; #p call mom")` returns `["#w fix bug", "#p call mom"]`
- [x] `splitMultiCapture("single task")` returns `["single task"]`
- [x] `splitMultiCapture("a;b;c;d;e;f;g;h;i;j;k;l")` returns first 10 items only
- [x] Test file created: `src/__tests__/multi-capture.test.ts`
- [x] `bun test multi-capture` → PASS

**Commit**: YES
- Message: `feat(capture): add splitMultiCapture for multi-task parsing`
- Files: `src/lib/capture.ts`, `src/__tests__/multi-capture.test.ts`

---

### Task 4: Update Bot Message Handler for Multi-Capture

**What to do**:
- Import `splitMultiCapture` in `src/bot/handlers/message.ts`
- In `processSingleMessage()`, check if text contains `;` or `\n`
- If multiple items detected, loop through each and create separate tasks
- Reply with "✓ × N" where N is count of created tasks
- Preserve per-item tag handling: `#w fix bug; #p call mom` → 2 tasks in different folders

**Must NOT do**:
- Don't change media group handling
- Don't add date extraction (future enhancement)

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
  - Reason: Moderate logic changes to existing handler
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: Bot handler patterns

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: Bot-only, no UI

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2
- **Blocks**: Task 8
- **Blocked By**: Task 3

**References**:
- `src/bot/handlers/message.ts:61-127` — processSingleMessage() to modify
- `src/lib/capture.ts` — processMessage() for each item
- `src/db/tasks.ts:30-67` — createTask() called per item

**Acceptance Criteria**:
- [ ] Send "buy milk; call mom; fix bug" to bot → creates 3 tasks
- [ ] Bot replies "✓ × 3" (or similar confirmation)
- [ ] Send "#w deploy; #p groceries" → 2 tasks in work/personal folders
- [ ] Manual: Send multi-line message → creates task per line
- [ ] Screenshot: Telegram showing multi-task confirmation

**Commit**: YES
- Message: `feat(bot): support multi-task capture via semicolons and newlines`
- Files: `src/bot/handlers/message.ts`

---

### Task 5: Implement Recurring Task Completion Logic

**What to do**:
- In `PATCH /tasks/:id` when `status` changes to `done`:
  - Check if task has `recurrence_rule`
  - If yes, create clone with `scheduledDate = nextOccurrence(task.scheduledDate, rule)`
  - Clone inherits: content, folder, type, recurrence_rule
  - Clone has: `status = 'active'`, new id, new timestamps
- Add helper `getNextOccurrence(currentDate: string, rule: RecurrenceRule): string`
  - `daily`: +1 day
  - `weekdays`: +1 day, skip weekends
  - `weekly`: +7 days

**Must NOT do**:
- Don't add UI for setting recurrence (separate task)
- Don't modify Sunset/Mixer behavior

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
  - Reason: Date calculation + API logic
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: Date handling patterns

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: Backend-only logic

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2
- **Blocks**: Task 8
- **Blocked By**: Task 1

**References**:
- `src/api/routes/tasks.ts:110-146` — PATCH /:id handler
- `src/db/tasks.ts:30-67` — createTask() for cloning
- `src/db/tasks.ts:118-209` — updateTask() for completion

**Acceptance Criteria**:
- [x] Complete task with `recurrence_rule = 'daily'` and `scheduledDate = '2025-02-09'`
- [x] Original task becomes `done`, new task created with `scheduledDate = '2025-02-10'`
- [x] New task has `status = 'active'`, inherits content/folder/recurrence_rule
- [x] Test: `src/__tests__/recurring.test.ts` covers daily/weekdays/weekly
- [x] `bun test recurring` → PASS

**Commit**: YES
- Message: `feat(api): auto-create next occurrence when completing recurring task`
- Files: `src/api/routes/tasks.ts`, `src/__tests__/recurring.test.ts`

---

### Task 6: Add Upcoming Section to FocusTab

**What to do**:
- Create `UpcomingList.tsx` component in `frontend/src/components/`
- Use new `useUpcomingTasks()` hook that calls `GET /tasks/upcoming`
- Display as collapsible section below TodayList
- Group by date: "Tomorrow", "This Week", "Later"
- Tap task → open TaskDetailSheet
- Add to FocusTab: `<InboxStack />` → `<TodayList />` → `<UpcomingList />`

**Must NOT do**:
- Don't add inline editing
- Don't add swipe gestures (simple tap to view)

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
  - Reason: New UI component with date grouping
- **Skills**: [`frontend-ui-ux`, `typescript-programmer`]
  - `frontend-ui-ux`: Visual component design
  - `typescript-programmer`: React patterns

**Skills Evaluated but Omitted**:
- `git-master`: No complex git operations

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2
- **Blocks**: Task 8
- **Blocked By**: Task 2

**References**:
- `frontend/src/screens/FocusTab.tsx:1-12` — FocusTab structure
- `frontend/src/components/TodayList.tsx` — pattern for task list
- `frontend/src/api/tasks.ts:96-134` — useTasks hook pattern
- `frontend/src/components/TaskRow.tsx` — task display component

**Acceptance Criteria**:
- [ ] `useUpcomingTasks()` hook exists in `frontend/src/api/tasks.ts`
- [ ] `UpcomingList.tsx` renders tasks grouped by relative date
- [ ] FocusTab shows: Inbox → Today → Upcoming (collapsed by default)
- [ ] Tap upcoming task → TaskDetailSheet opens
- [ ] Screenshot: FocusTab with Upcoming section visible

**Commit**: YES
- Message: `feat(frontend): add Upcoming section showing future-dated tasks`
- Files: `frontend/src/components/UpcomingList.tsx`, `frontend/src/screens/FocusTab.tsx`, `frontend/src/api/tasks.ts`

---

### Task 7: Fix CalendarSheet to Set scheduledDate

**What to do**:
- In `CalendarSheet.tsx`, change `scheduleTask()` to set `scheduledDate` instead of/in addition to `deadline`
- Convert selected date to `YYYY-MM-DD` string format
- Optionally keep deadline as timestamp for reminder purposes
- Update to `status: 'active'` so task appears in Today/Upcoming based on date

**Must NOT do**:
- Don't add recurrence picker (separate task)
- Don't change quick date options

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Simple field change in existing component
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Understand date handling in UI

**Skills Evaluated but Omitted**:
- `typescript-programmer`: Minimal TypeScript changes

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
- **Blocks**: Task 8
- **Blocked By**: None

**References**:
- `frontend/src/components/sheets/CalendarSheet.tsx:67-86` — scheduleTask() function
- `frontend/src/api/tasks.ts:33-35` — TaskUpdatePayload type

**Acceptance Criteria**:
- [ ] Select "Tomorrow" + "Morning" → task gets `scheduledDate = 'YYYY-MM-DD'` (tomorrow)
- [ ] Task with future `scheduledDate` appears in Upcoming, not Today
- [ ] Task with today's `scheduledDate` appears in Today
- [ ] Manual: Use CalendarSheet, verify via `sqlite3 data/lazyflow.db "SELECT scheduled_date FROM tasks WHERE id='...'"`

**Commit**: YES
- Message: `fix(frontend): CalendarSheet sets scheduledDate for proper date-based visibility`
- Files: `frontend/src/components/sheets/CalendarSheet.tsx`

---

### Task 8: Client Journey Validation (E2E Flow)

**What to do**:
Document and manually verify complete user journey:

#### Journey A: Inbox → Today → Archive
1. Send "test task" to bot → appears in InboxStack
2. Swipe right → moves to TodayList (status: active)
3. Tap checkbox → moves to Archive (status: done)
4. Open Shelves → Archive → see completed task

#### Journey B: Future-Dated Task Visibility
1. Send "future task" to bot → appears in Inbox
2. Swipe up → CalendarSheet opens
3. Select "Friday" + "Morning" → task scheduled
4. Task appears in Upcoming section (not Today)
5. On Friday morning → task appears in Today

#### Journey C: Recurring Task
1. API: Create task with `recurrence_rule: 'daily'`, `scheduledDate: today`
2. Task appears in Today
3. Complete task → original goes to Archive
4. New task auto-created with tomorrow's date
5. New task appears in Upcoming

#### Journey D: Multi-Capture
1. Send "buy milk; call mom; fix bug #w" to bot
2. Bot replies "✓ × 3"
3. Open Mini App → 3 tasks in Inbox
4. Each task processed individually (fix bug in work folder)

**Must NOT do**:
- Don't automate with Playwright (manual verification for MVP)

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Documentation and manual testing
- **Skills**: [`dev-browser`]
  - `dev-browser`: Interactive browser testing

**Skills Evaluated but Omitted**:
- `typescript-programmer`: No code changes

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (final)
- **Blocks**: None (final task)
- **Blocked By**: Tasks 4, 5, 6, 7

**References**:
- `frontend/src/screens/FocusTab.tsx` — main screen to verify
- `frontend/src/components/InboxStack.tsx` — swipe gestures
- Bot: Telegram chat with bot

**Acceptance Criteria**:
- [ ] Journey A documented with screenshots in `.sisyphus/evidence/journey-a-*.png`
- [ ] Journey B documented with screenshots
- [ ] Journey C documented with screenshots
- [ ] Journey D documented with screenshots
- [ ] All pass/fail criteria checked and logged

**Commit**: YES
- Message: `docs: add client journey validation evidence for v2 features`
- Files: `.sisyphus/evidence/*.png`, `.sisyphus/evidence/VALIDATION.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(db): add recurrence_rule column` | schema.sql, types.ts, tasks.ts | sqlite3 .schema |
| 2 | `feat(api): date-aware filtering + /upcoming` | tasks.ts (db+api) | curl /tasks/upcoming |
| 3 | `feat(capture): splitMultiCapture parser` | capture.ts, test | bun test |
| 4 | `feat(bot): multi-task capture` | message.ts | Send to bot |
| 5 | `feat(api): recurring task completion` | tasks.ts (api), test | bun test |
| 6 | `feat(frontend): Upcoming section` | UpcomingList.tsx, FocusTab.tsx | Visual check |
| 7 | `fix(frontend): CalendarSheet scheduledDate` | CalendarSheet.tsx | Use sheet + db check |
| 8 | `docs: client journey validation` | evidence/ | Review screenshots |

---

## Success Criteria

### Verification Commands
```bash
# Backend tests
bun test

# Check schema
sqlite3 data/lazyflow.db ".schema tasks" | grep recurrence_rule

# Check upcoming endpoint
curl -H "Authorization: tma ..." http://localhost:3000/tasks/upcoming

# Frontend build
cd frontend && bun run build
```

### Final Checklist
- [ ] All 4 product goals implemented:
  - [A] Lifecycle: Inbox → Today → Archive flow works
  - [B] Future-dated: Upcoming section shows scheduled tasks
  - [C] Recurring: Completing daily task creates tomorrow's occurrence
  - [D] Multi-capture: "a; b; c" creates 3 tasks
- [ ] No breaking changes to existing behavior
- [ ] All tests pass
- [ ] Client journey validation complete with evidence

---

## Rollout Order and Risk Mitigation

### Phase 1: Backend Foundation (Tasks 1, 2, 3)
- **Risk**: Schema migration on production DB
- **Mitigation**: SQLite `ALTER TABLE ADD COLUMN` is non-destructive, null default

### Phase 2: Bot + API Logic (Tasks 4, 5)  
- **Risk**: Multi-capture could create spam
- **Mitigation**: Cap at 10 tasks per message, rate limit via existing mechanism

### Phase 3: Frontend (Tasks 6, 7)
- **Risk**: Breaking existing Today view behavior
- **Mitigation**: `scheduledDate = null` tasks still appear in Today (backward compatible)

### Phase 4: Validation (Task 8)
- **Risk**: Missed edge cases
- **Mitigation**: Comprehensive client journey covers all flows

### Rollback Plan
- Each commit is atomic and revertable
- Schema column addition is safe to leave if features reverted
- No data migration required
