# Decisions

## 2026-02-05 Session Start
- Implementation order: Backend → Bot → Frontend (each stage = testable product)
- Testing: TDD approach with bun:test
- SDK: @telegram-apps/sdk-react v2.x (NOT old @tma.js)
- NO @grammyjs/conversations (single-message onboarding is enough)

## 2026-02-09 Product Logic v2
- Reused existing `scheduled_date` as the visibility gate for Today vs Upcoming instead of adding new columns.
- Added `recurrence_rule` with constrained values (`daily`, `weekdays`, `weekly`) as MVP recurrence model.
- Implemented recurrence expansion at completion time (`PATCH /tasks/:id` when status becomes `done`).
- Added `splitMultiCapture()` with hard cap of 10 tasks per message for spam control.
- For multi-capture idempotency, extra tasks use deterministic negative `telegram_message_id` values to avoid unique-index conflicts.
