# NLP Date Parsing for Russian Language

## TL;DR

> **Quick Summary**: Add Russian-language natural date/time parsing to bot message capture using a hybrid regex + AI fallback approach. Parsed dates automatically schedule tasks, skipping Inbox.
>
> **Deliverables**:
> - `src/lib/dateParser.ts` - Core date parsing module with regex + AI fallback
> - Updated `src/lib/capture.ts` - Integrates date parsing into capture flow
> - Updated `src/lib/types.ts` - Extended `CaptureResult` type
> - Updated `src/bot/handlers/message.ts` - Passes date fields to `createTask()`
> - `src/__tests__/dateParser.test.ts` - Comprehensive test suite
>
> **Estimated Effort**: Medium (4-6 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
Add advanced NLP date parsing (like Todoist/ChatGPT) to bot message capture. User wants to write Russian phrases like "Позвонить клиенту завтра в 10:00" and have tasks automatically scheduled with `scheduledDate`, `scheduledTime`, `deadline`, `recurrenceRule`.

### Interview Summary
**Key Discussions**:
- **Approach**: Hybrid regex + AI fallback (Option C) - best balance of speed/cost/accuracy
- **Language**: Russian only for MVP
- **Time mappings**: утром→09:00, днём/обед→14:00, вечером→19:00

**Research Findings**:
- `createTask()` already accepts all scheduling fields (no DB changes needed)
- `src/lib/recurrence.ts` has helper functions: `toDateString()`, `buildDeadlineFromSchedule()`
- AI classifier pattern in `src/lib/ai/classifier.ts` can be reused for AI fallback
- Test infrastructure exists with `bun:test`

### Metis Review
**Identified Gaps** (addressed):
- **Timezone handling**: Use `Asia/Yekaterinburg` (hardcoded for now, user's timezone)
- **Content stripping**: YES - strip parsed date/time phrases from task content
- **Weekday rule**: "в субботу" means NEXT Saturday (always future, minimum tomorrow)
- **Complex recurrence**: Out of scope (e.g., "каждый понедельник с 17 февраля")

---

## Work Objectives

### Core Objective
Enable natural Russian date/time parsing in bot message capture, automatically scheduling tasks with parsed dates.

### Concrete Deliverables
- `src/lib/dateParser.ts` - Date parsing module
- Updated `src/lib/types.ts` - Extended `CaptureResult`
- Updated `src/lib/capture.ts` - Integrated date parsing
- Updated `src/bot/handlers/message.ts` - Task creation with dates
- `src/__tests__/dateParser.test.ts` - Test suite

### Definition of Done
- [ ] `bun test` passes all new and existing tests
- [ ] "завтра в 10:00" creates task with correct `scheduledDate` + `scheduledTime`
- [ ] "каждый понедельник" creates task with `recurrenceRule='weekly'`
- [ ] "позвонить клиенту" (no date) goes to Inbox as before
- [ ] Existing capture tests still pass

### Must Have
- Parse: сегодня, завтра, послезавтра, через N дней, через неделю
- Parse: weekdays (понедельник-воскресенье)
- Parse: time (HH:MM format, утром, днём, вечером, в обед)
- Parse: recurrence (каждый день, каждый понедельник, по будням)
- Strip parsed phrases from content
- Set `status='active'` when date is parsed (skip Inbox)
- Calculate `deadline` when both date and time are present

### Must NOT Have (Guardrails)
- NO English language parsing (Russian only)
- NO complex phrases: "через месяц", "через год", "в следующем году"
- NO specific calendar dates: "17 февраля", "15.03.2026"
- NO custom time mappings beyond hardcoded defaults
- NO user timezone lookup from DB (use hardcoded timezone for now)
- NO breaking existing capture tests
- NO changes to DB schema

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES
- **User wants tests**: TDD
- **Framework**: `bun:test`

### TDD Enabled

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**
1. **RED**: Write failing test first
   - Test file: `src/__tests__/dateParser.test.ts`
   - Test command: `bun test src/__tests__/dateParser.test.ts`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `bun test src/__tests__/dateParser.test.ts`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `bun test`
   - Expected: ALL tests PASS (including existing capture tests)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Create DateParseResult type and extend CaptureResult (no dependencies)
└── (No other independent tasks - all depend on types)

Wave 2 (After Wave 1):
├── Task 2: Implement core date parser (depends: 1)
└── Task 3: Write comprehensive test suite (can start in parallel with Task 2 - TDD)

Wave 3 (After Wave 2):
├── Task 4: Integrate with capture.ts (depends: 2)
└── (Task 4 unblocks Task 5)

Wave 4 (After Wave 3):
└── Task 5: Integrate with message handler (depends: 4)

Wave 5 (After Wave 4):
└── Task 6: Add AI fallback for complex phrases (depends: 2, optional enhancement)

Critical Path: Task 1 → Task 2 → Task 4 → Task 5
Parallel Speedup: Tasks 2+3 can run together (TDD style)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | None (must be first) |
| 2 | 1 | 4, 6 | 3 (TDD - test before impl) |
| 3 | 1 | None | 2 |
| 4 | 2 | 5 | None |
| 5 | 4 | None | None |
| 6 | 2 | None | 4, 5 (can be done last) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | `quick` - simple type additions |
| 2 | 2, 3 | `unspecified-high` - core logic + tests |
| 3 | 4 | `quick` - integration glue |
| 4 | 5 | `quick` - integration glue |
| 5 | 6 | `unspecified-low` - AI integration |

---

## TODOs

### Task 1: Define Types - DateParseResult and Extended CaptureResult

**What to do**:
- Create `DateParseResult` interface in `src/lib/types.ts`
- Extend `CaptureResult` interface to include optional date fields
- Keep backwards compatibility (all new fields optional)

**Type definitions to add**:
```typescript
export interface DateParseResult {
  scheduledDate: string | null;      // YYYY-MM-DD
  scheduledTime: string | null;      // HH:MM
  recurrenceRule: RecurrenceRule | null;
  strippedContent: string;           // Content with date phrases removed
  confidence: 'high' | 'medium' | 'low';
  parsedPhrases: string[];           // What was extracted (for debugging)
}

// Extend CaptureResult (add fields):
export interface CaptureResult {
  // ... existing fields ...
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  deadline?: number | null;
}
```

**Must NOT do**:
- Do NOT modify existing required fields in CaptureResult
- Do NOT add any DB-related types

**Recommended Agent Profile**:
- **Category**: `quick` - Simple type additions, single file edit
  - Reason: Straightforward TypeScript interface extension, <10 lines of code
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: Ensures proper TypeScript syntax and type safety

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: No frontend work
- `python-programmer`: Not Python
- `git-master`: Will be used at commit time, not during task

**Parallelization**:
- **Can Run In Parallel**: NO (foundational task)
- **Parallel Group**: Wave 1 (solo)
- **Blocks**: Tasks 2, 3
- **Blocked By**: None (can start immediately)

**References**:

**Pattern References**:
- `src/lib/types.ts:176-184` - Existing `CaptureResult` interface (extend this)
- `src/lib/types.ts:9` - Existing `RecurrenceRule` type (reuse this)

**Type References**:
- `src/lib/types.ts:26-28` - TaskDTO date fields (match these types)

**Acceptance Criteria**:

- [ ] Test file created: `src/__tests__/dateParser.test.ts` (import types, verify no compile errors)
- [ ] `bun test --dry-run` succeeds (no TypeScript errors)
- [ ] `DateParseResult` interface exists and exports correctly
- [ ] `CaptureResult` extended with optional date fields
- [ ] No changes to existing required fields

**Commit**: YES
- Message: `feat(capture): add DateParseResult type and extend CaptureResult for scheduling`
- Files: `src/lib/types.ts`
- Pre-commit: `bun test --dry-run`

---

### Task 2: Implement Core Date Parser - Regex Patterns for Russian

**What to do**:
- Create `src/lib/dateParser.ts` with `parseDateFromText(text: string, baseDate?: Date)` function
- Implement regex patterns for all required Russian date/time phrases
- Return `DateParseResult` with parsed values and stripped content
- Use `Asia/Yekaterinburg` timezone for date calculations

**Regex patterns to implement**:

| Category | Patterns | Output |
|----------|----------|--------|
| Relative | `сегодня` | scheduledDate = today |
| Relative | `завтра` | scheduledDate = today + 1 |
| Relative | `послезавтра` | scheduledDate = today + 2 |
| Offset | `через (\d+) (день\|дня\|дней)` | scheduledDate = today + N |
| Offset | `через неделю` | scheduledDate = today + 7 |
| Weekday | `в (понедельник\|вторник\|...)` | scheduledDate = next occurrence |
| Time | `в (\d{1,2}):(\d{2})` | scheduledTime = HH:MM |
| Time | `утром` | scheduledTime = 09:00 |
| Time | `днём\|в обед` | scheduledTime = 14:00 |
| Time | `вечером` | scheduledTime = 19:00 |
| Recurrence | `каждый день` | recurrenceRule = 'daily' |
| Recurrence | `каждый (понедельник\|...)` | recurrenceRule = 'weekly' |
| Recurrence | `по будням` | recurrenceRule = 'weekdays' |

**Algorithm**:
1. Check for recurrence patterns first (they imply scheduling)
2. Check for relative dates (сегодня, завтра, etc.)
3. Check for offset dates (через N дней)
4. Check for weekday references
5. Check for time patterns
6. Strip all matched phrases from content
7. Return result with confidence level

**Must NOT do**:
- Do NOT implement AI fallback (separate task)
- Do NOT handle complex phrases like "через месяц"
- Do NOT parse specific calendar dates like "17 февраля"
- Do NOT access DB or user settings

**Recommended Agent Profile**:
- **Category**: `unspecified-high` - Core business logic with regex complexity
  - Reason: Complex regex patterns, date math, multiple edge cases require careful implementation
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: Complex TypeScript with type safety for date handling

**Skills Evaluated but Omitted**:
- `python-programmer`: Not Python
- `prompt-engineer`: No AI prompts yet
- `frontend-ui-ux`: Backend logic only

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 3 in TDD style)
- **Parallel Group**: Wave 2 (with Task 3)
- **Blocks**: Tasks 4, 6
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/lib/recurrence.ts:17-22` - `toDateString()` function (reuse for date formatting)
- `src/lib/recurrence.ts:28-33` - `addDays()` helper pattern (similar logic needed)
- `src/lib/recurrence.ts:55-64` - `buildDeadlineFromSchedule()` (call this for deadline calculation)

**Type References**:
- `src/lib/types.ts:DateParseResult` - Return type (created in Task 1)
- `src/lib/types.ts:RecurrenceRule` - Recurrence enum type

**Test References**:
- `src/__tests__/capture.test.ts` - Test structure pattern to follow
- `src/__tests__/recurring.test.ts` - Recurrence test patterns

**WHY Each Reference Matters**:
- `toDateString()`: MUST use this to format dates as YYYY-MM-DD (consistency with existing code)
- `buildDeadlineFromSchedule()`: MUST call this to calculate deadline from date+time (don't reimplement)

**Acceptance Criteria**:

- [ ] Test file: `src/__tests__/dateParser.test.ts`
- [ ] `bun test src/__tests__/dateParser.test.ts` → PASS
- [ ] "завтра в 10:00" → `{scheduledDate: '2026-02-11', scheduledTime: '10:00', confidence: 'high'}`
- [ ] "в пятницу" → `{scheduledDate: '2026-02-13', confidence: 'high'}` (next Friday from Feb 10)
- [ ] "каждый понедельник" → `{scheduledDate: '2026-02-16', recurrenceRule: 'weekly', confidence: 'high'}`
- [ ] "через 3 дня" → `{scheduledDate: '2026-02-13', confidence: 'high'}`
- [ ] "позвонить клиенту" → `{scheduledDate: null, confidence: 'low'}` (no date detected)
- [ ] Content is stripped: "Позвонить завтра в 10" → strippedContent: "Позвонить"

**Commit**: YES
- Message: `feat(capture): implement Russian date parser with regex patterns`
- Files: `src/lib/dateParser.ts`, `src/__tests__/dateParser.test.ts`
- Pre-commit: `bun test`

---

### Task 3: Write Comprehensive Test Suite for Date Parser

**What to do**:
- Create/expand `src/__tests__/dateParser.test.ts` with all test cases
- Cover all patterns from requirements
- Include edge cases and failure cases
- Test content stripping behavior

**Test cases to cover**:

```typescript
describe('Date Parser: Relative Dates', () => {
  it('"сегодня" → today');
  it('"завтра" → tomorrow');
  it('"послезавтра" → day after tomorrow');
});

describe('Date Parser: Day Offsets', () => {
  it('"через 1 день" → today + 1');
  it('"через 3 дня" → today + 3');
  it('"через 5 дней" → today + 5');
  it('"через неделю" → today + 7');
});

describe('Date Parser: Weekdays', () => {
  it('"в понедельник" → next Monday');
  it('"в пятницу" → next Friday');
  it('"в субботу" → next Saturday');
  // Edge: if today is Friday, "в пятницу" = NEXT Friday (7 days)
});

describe('Date Parser: Time', () => {
  it('"в 10:00" → scheduledTime 10:00');
  it('"в 9:30" → scheduledTime 09:30');
  it('"утром" → scheduledTime 09:00');
  it('"днём" → scheduledTime 14:00');
  it('"в обед" → scheduledTime 14:00');
  it('"вечером" → scheduledTime 19:00');
});

describe('Date Parser: Recurrence', () => {
  it('"каждый день" → daily');
  it('"каждый понедельник" → weekly + next Monday');
  it('"по будням" → weekdays + next weekday');
});

describe('Date Parser: Content Stripping', () => {
  it('strips date phrase from content');
  it('preserves task description');
  it('handles multiple phrases');
});

describe('Date Parser: No Date Detected', () => {
  it('plain text returns null values');
  it('confidence is low when no date');
});

describe('Date Parser: Combined Patterns', () => {
  it('"завтра в 10:00" → date + time');
  it('"в пятницу вечером" → next Friday + 19:00');
  it('"каждый понедельник в 9:00" → weekly + time');
});
```

**Must NOT do**:
- Do NOT test AI fallback (separate task)
- Do NOT test integration with capture.ts (Task 4)

**Recommended Agent Profile**:
- **Category**: `unspecified-high` - Comprehensive test suite requires care
  - Reason: Many test cases, edge cases, date math verification
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: TypeScript test patterns with bun:test

**Skills Evaluated but Omitted**:
- `python-debugger`: Not Python
- `frontend-ui-ux`: Backend tests only

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 2 - TDD)
- **Parallel Group**: Wave 2 (with Task 2)
- **Blocks**: None (tests inform implementation)
- **Blocked By**: Task 1

**References**:

**Test References**:
- `src/__tests__/capture.test.ts:1-35` - Test structure with `describe`/`it` pattern
- `src/__tests__/recurring.test.ts` - Date-related test patterns

**Pattern References**:
- `src/__tests__/capture.test.ts:4-35` - Capture precedence test structure (follow similar grouping)

**Acceptance Criteria**:

- [ ] Test file: `src/__tests__/dateParser.test.ts`
- [ ] All `describe` blocks from above exist
- [ ] Minimum 25 test cases covering all patterns
- [ ] Edge cases tested (e.g., today is the target weekday)
- [ ] `bun test src/__tests__/dateParser.test.ts` runs (may fail until Task 2 completes)

**Commit**: YES (with Task 2)
- Message: `feat(capture): implement Russian date parser with regex patterns`
- Files: `src/__tests__/dateParser.test.ts`
- Pre-commit: `bun test`

---

### Task 4: Integrate Date Parser into capture.ts

**What to do**:
- Import `parseDateFromText` in `src/lib/capture.ts`
- Call date parser in `processMessage()` function
- Set `status='active'` when date is successfully parsed
- Return date fields in `CaptureResult`
- Use `buildDeadlineFromSchedule()` to calculate deadline

**Integration logic**:
```typescript
// In processMessage(), after existing logic:

// Parse dates from content
const dateResult = parseDateFromText(content);

if (dateResult.scheduledDate) {
  // Date parsed successfully → skip Inbox
  status = 'active';
  
  // Calculate deadline if time is also present
  if (dateResult.scheduledTime) {
    const deadline = buildDeadlineFromSchedule(
      dateResult.scheduledDate, 
      dateResult.scheduledTime
    );
    // Include in result
  }
  
  // Use stripped content
  content = dateResult.strippedContent;
}

return {
  ...existingResult,
  scheduledDate: dateResult.scheduledDate,
  scheduledTime: dateResult.scheduledTime,
  recurrenceRule: dateResult.recurrenceRule,
  deadline
};
```

**Preserve existing capture logic**:
- Tags (`#w`, `#p`, `#i`) STILL work and take precedence for folder
- Notes (>500 chars) STILL bypass Inbox
- Media/URLs STILL go to `media` folder
- Date parsing is ADDITIVE, not replacing

**Must NOT do**:
- Do NOT change tag parsing logic
- Do NOT change note detection logic
- Do NOT change media handling
- Do NOT break existing tests

**Recommended Agent Profile**:
- **Category**: `quick` - Integration glue code
  - Reason: Adding function call and passing fields through, not complex logic
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: TypeScript imports and function calls

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: Backend only
- `git-master`: Will be used at commit

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (solo)
- **Blocks**: Task 5
- **Blocked By**: Task 2

**References**:

**Pattern References**:
- `src/lib/capture.ts:30-103` - `processMessage()` function to modify
- `src/lib/capture.ts:95-103` - Return statement pattern (add new fields here)

**API/Type References**:
- `src/lib/types.ts:CaptureResult` - Extended interface from Task 1
- `src/lib/recurrence.ts:55-64` - `buildDeadlineFromSchedule()` to import and call

**Test References**:
- `src/__tests__/capture.test.ts` - Existing tests that MUST still pass

**WHY Each Reference Matters**:
- `processMessage()`: This is THE function to modify - understand its flow
- `buildDeadlineFromSchedule()`: MUST use this, not reimplement deadline calculation
- Existing tests: MUST verify they still pass after changes

**Acceptance Criteria**:

- [ ] `bun test src/__tests__/capture.test.ts` → ALL PASS (existing tests)
- [ ] `bun test src/__tests__/dateParser.test.ts` → ALL PASS
- [ ] Integration test: `processMessage("завтра в 10:00")` returns `{scheduledDate, scheduledTime, status: 'active'}`
- [ ] Integration test: `processMessage("buy milk")` returns `{status: 'inbox', scheduledDate: null}`
- [ ] Tag precedence preserved: `processMessage("#w завтра")` → `folder: 'work'`

**Commit**: YES
- Message: `feat(capture): integrate date parser into processMessage flow`
- Files: `src/lib/capture.ts`
- Pre-commit: `bun test`

---

### Task 5: Update Bot Message Handler to Pass Date Fields

**What to do**:
- Update `src/bot/handlers/message.ts` to pass date fields to `createTask()`
- Handle `captureResult.scheduledDate`, `scheduledTime`, `recurrenceRule`, `deadline`

**Changes needed**:
```typescript
// In processSingleMessage(), around line 118:
const task = createTask({
  userId,
  content,
  type: captureResult.type,
  status: captureResult.status,
  folder: captureResult.folder,
  source: 'bot',
  telegramMessageId,
  // NEW: Add date fields
  scheduledDate: captureResult.scheduledDate,
  scheduledTime: captureResult.scheduledTime,
  recurrenceRule: captureResult.recurrenceRule,
  deadline: captureResult.deadline
});
```

**Also update**:
- `processMediaGroup()` function (line 217)
- `handleEditedMessage()` function (line 265) - preserve existing scheduling on edit

**Must NOT do**:
- Do NOT change AI classification scheduling
- Do NOT change media processing flow
- Do NOT modify `createTask()` function (it already accepts these fields)

**Recommended Agent Profile**:
- **Category**: `quick` - Simple parameter passing
  - Reason: Just adding fields to function calls, minimal logic
- **Skills**: [`typescript-programmer`]
  - `typescript-programmer`: TypeScript parameter passing

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: Backend only
- `git-master`: Will be used at commit

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 4 (solo)
- **Blocks**: None (final integration step)
- **Blocked By**: Task 4

**References**:

**Pattern References**:
- `src/bot/handlers/message.ts:117-126` - `createTask()` call to modify
- `src/bot/handlers/message.ts:217-225` - Album `createTask()` call
- `src/bot/handlers/message.ts:265-273` - Edit handler `updateTask()` call

**API/Type References**:
- `src/db/tasks.ts:39-51` - `createTask()` signature (already accepts scheduling fields)
- `src/lib/types.ts:CaptureResult` - Extended interface with date fields

**Acceptance Criteria**:

- [ ] `bun test` → ALL PASS
- [ ] Manual verification via tmux:
  - Send "Позвонить завтра в 10:00" to bot
  - Check task in DB has `scheduled_date`, `scheduled_time`, `status='active'`
- [ ] Manual verification: Plain text still goes to Inbox

**Commit**: YES
- Message: `feat(bot): pass parsed date fields to task creation`
- Files: `src/bot/handlers/message.ts`
- Pre-commit: `bun test`

---

### Task 6: Add AI Fallback for Complex Phrases (Optional Enhancement)

**What to do**:
- Add AI fallback in `src/lib/dateParser.ts` for phrases regex can't handle
- Use existing OpenAI/Gemini pattern from `src/lib/ai/classifier.ts`
- Only trigger for low-confidence regex results with date-like keywords

**AI Fallback triggers when**:
- Regex confidence is 'low'
- Text contains date-like keywords: "в", "через", "каждый", time words
- Text length < 200 chars (don't waste API on long texts)

**Prompt for AI**:
```
Extract date/time from this Russian task:
"${text}"

Return JSON:
{
  "scheduledDate": "YYYY-MM-DD" or null,
  "scheduledTime": "HH:MM" or null,
  "recurrenceRule": "daily"|"weekdays"|"weekly" or null,
  "strippedContent": "task without date phrases"
}

Today is ${today}. Timezone: Asia/Yekaterinburg.
```

**Must NOT do**:
- Do NOT call AI for every message (only fallback)
- Do NOT block on AI failure (return regex result if AI fails)
- Do NOT add new dependencies

**Recommended Agent Profile**:
- **Category**: `unspecified-low` - AI integration with existing pattern
  - Reason: Following existing classifier pattern, moderate complexity
- **Skills**: [`typescript-programmer`, `prompt-engineer`]
  - `typescript-programmer`: Async/await, error handling
  - `prompt-engineer`: Crafting effective date extraction prompt

**Skills Evaluated but Omitted**:
- `frontend-ui-ux`: Backend only
- `python-programmer`: Not Python

**Parallelization**:
- **Can Run In Parallel**: YES (can start after Task 2, parallel with 4, 5)
- **Parallel Group**: Wave 3-5 (independent enhancement)
- **Blocks**: None
- **Blocked By**: Task 2

**References**:

**Pattern References**:
- `src/lib/ai/classifier.ts:7-54` - OpenAI API call pattern (reuse this structure)
- `src/lib/ai/classifier.ts:57-116` - Gemini fallback pattern
- `src/lib/ai/index.ts:47-62` - Primary + fallback orchestration

**API/Type References**:
- `src/lib/types.ts:DateParseResult` - Return type
- Environment: `OPENAI_API_KEY`, `GEMINI_API_KEY` from env

**WHY Each Reference Matters**:
- `OpenAIClassifier`: Exact API call pattern to copy (fetch, headers, JSON mode)
- `ai/index.ts`: How to orchestrate OpenAI → Gemini fallback

**Acceptance Criteria**:

- [ ] Test: Complex phrase triggers AI fallback
- [ ] Test: AI failure falls back to regex result gracefully
- [ ] Test: Short simple phrases don't trigger AI (use regex only)
- [ ] `bun test` → ALL PASS

**Commit**: YES
- Message: `feat(capture): add AI fallback for complex date phrases`
- Files: `src/lib/dateParser.ts`
- Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(capture): add DateParseResult type and extend CaptureResult` | `src/lib/types.ts` | `bun test --dry-run` |
| 2+3 | `feat(capture): implement Russian date parser with regex patterns` | `src/lib/dateParser.ts`, `src/__tests__/dateParser.test.ts` | `bun test` |
| 4 | `feat(capture): integrate date parser into processMessage flow` | `src/lib/capture.ts` | `bun test` |
| 5 | `feat(bot): pass parsed date fields to task creation` | `src/bot/handlers/message.ts` | `bun test` |
| 6 | `feat(capture): add AI fallback for complex date phrases` | `src/lib/dateParser.ts` | `bun test` |

---

## Success Criteria

### Verification Commands
```bash
# Run all tests
bun test

# Run specific date parser tests
bun test src/__tests__/dateParser.test.ts

# Verify existing capture tests still pass
bun test src/__tests__/capture.test.ts
bun test src/__tests__/multi-capture.test.ts
```

### Final Checklist
- [ ] All "Must Have" patterns recognized and parsed correctly
- [ ] All "Must NOT Have" exclusions respected (no English, no complex dates)
- [ ] All existing capture tests pass (no regressions)
- [ ] TDD tests cover all documented patterns
- [ ] Date phrases stripped from task content
- [ ] Scheduled tasks bypass Inbox (`status='active'`)
- [ ] Deadline calculated when both date and time present
