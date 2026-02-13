# Draft: NLP Date Parsing for Russian Language

## Requirements (confirmed)

### Parsing Scope
- **Relative dates**: сегодня, завтра, послезавтра → scheduledDate
- **Day offsets**: через N дней, через неделю → scheduledDate
- **Weekdays**: в понедельник, в пятницу → scheduledDate (next occurrence)
- **Time phrases**: в HH:MM, утром (09:00), днём/в обед (14:00), вечером (19:00) → scheduledTime
- **Recurrence**: каждый день, каждый понедельник, по будням → recurrenceRule

### Time Mappings
| Phrase | scheduledTime |
|--------|--------------|
| утром | 09:00 |
| днём / в обед | 14:00 |
| вечером | 19:00 |
| в HH:MM | HH:MM |

### Behavior Rules
1. Date parsed → status='active' (skip Inbox)
2. Date+time → deadline (ms timestamp)
3. Recurrence detected → recurrenceRule set
4. No date in text → status='inbox' (existing behavior)

## Technical Decisions

### Approach: Option C (Hybrid Regex + AI Fallback)
- **Regex first**: Handles 90%+ of common Russian date patterns
- **AI fallback**: For ambiguous/complex phrases (e.g., "в пятницу после обеда")
- **Justification**: Best balance of speed, cost, and accuracy

### Why NOT Option A (AI Only):
- 200-500ms latency per message
- API cost per message
- Overkill for simple patterns like "завтра в 10:00"

### Why NOT Option B (Regex Only):
- Chrono.js has limited Russian support
- Can't handle complex natural language
- Limited to predefined patterns

## Integration Points (verified via code review)

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add date fields to `CaptureResult` interface |
| `src/lib/capture.ts` | Call date parser in `processMessage()`, return date fields |
| `src/bot/handlers/message.ts` | Pass date fields to `createTask()` |

### New File to Create
- `src/lib/dateParser.ts` - Main date parsing logic

### Existing Utilities to Leverage
- `src/lib/recurrence.ts`:
  - `toDateString(date: Date)` → YYYY-MM-DD
  - `buildDeadlineFromSchedule(scheduledDate, scheduledTime)` → ms timestamp
  - `nextOccurrence(baseDate, recurrenceRule)` → next date

### createTask() Already Accepts
- `deadline?: number | null`
- `scheduledDate?: string | null`
- `scheduledTime?: string | null`
- `recurrenceRule?: RecurrenceRule | null`

**No DB changes needed!**

## Scope Boundaries

### INCLUDE
- Russian date/time parsing (listed patterns)
- Regex patterns for common phrases
- AI fallback for complex cases
- Integration with existing capture flow
- Test suite for all patterns

### EXCLUDE
- English language support (Russian only for now)
- Complex phrases like "через месяц" (beyond MVP scope)
- Custom time mappings (use hardcoded defaults)
- User timezone settings (use Asia/Yekaterinburg from AGENTS.md)

## Test Strategy Decision
- **Infrastructure exists**: YES (bun:test)
- **User wants tests**: YES (TDD)
- **QA approach**: TDD with specific test cases

### Test Cases (from user)
- "завтра в 10:00" → scheduledDate=tomorrow, scheduledTime='10:00'
- "в пятницу" → scheduledDate=next Friday
- "каждый понедельник" → recurrenceRule='weekly', scheduledDate=next Monday
- "через 3 дня" → scheduledDate=today+3
- "позвонить клиенту" (no date) → Inbox, no scheduling
- Existing capture tests still pass

## Open Questions
- None remaining - requirements are clear

## AI Classifier Pattern Reference
- `src/lib/ai/classifier.ts` shows OpenAI + Gemini fallback pattern
- Same pattern can be used for date parsing AI fallback
