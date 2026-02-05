# Decisions

## 2026-02-05 Session Start
- Implementation order: Backend → Bot → Frontend (each stage = testable product)
- Testing: TDD approach with bun:test
- SDK: @telegram-apps/sdk-react v2.x (NOT old @tma.js)
- NO @grammyjs/conversations (single-message onboarding is enough)
