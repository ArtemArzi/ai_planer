# API Routes — AGENTS.md

## OVERVIEW
Hono-based REST API endpoints. Entry point: `src/api/index.ts`.

## CRITICAL RULES
- **Auth**: All routes MUST use Telegram `initData` validation middleware.
- **Responses**: MUST be `camelCase`. This is typically handled by `rowToDTO` in the DB layer.

## PATTERNS
- **Routing**: Grouped by resource (e.g., `routes/tasks.ts`, `routes/users.ts`).
- **Status Codes**: 
  - 200/201: Success.
  - 401: Invalid/Expired Telegram session.
  - 403: Ownership violation (e.g., unauthorized media access).

## ANTI-PATTERNS
- **Token Exposure**: NEVER return sensitive fields (Google tokens, internal IDs) in API responses.
- **Raw DB Objects**: NEVER return the result of `db.get()` directly; use DTOs.

## WHERE TO LOOK
- `src/api/middleware/auth.ts`: HMAC validation logic.
- `src/api/routes/users.ts`: Standard endpoint pattern.
