# Database Layer — AGENTS.md

## OVERVIEW
SQLite persistence layer using `bun:sqlite` with WAL mode enabled for performance.

## CRITICAL RULES
- **Timestamps**: ALWAYS store as MILLISECONDS. Use `unixepoch() * 1000` in SQL or `Date.now()` in JS.
- **Naming**: Table and column names MUST be `snake_case`.
- **Integrity**: ALWAYS enable `PRAGMA foreign_keys = ON`.

## PATTERNS
- **Migrations**: Procedural migrations in `index.ts` using `db.exec()`. No external migration tool.
- **CRUD**: Manual `rowToDTO` mapping in `tasks.ts` and `users.ts` (snake_case DB -> camelCase DTO + boolean conversion).
- **Transactions**: Use `db.transaction(() => { ... })` for atomic operations.

## ANTI-PATTERNS
- **Bare Seconds**: NEVER store `unixepoch()` results directly.
- **Generic DTO**: Avoid `toDTO()` generic helper if manual `rowToDTO` provides better type safety/casting.

## WHERE TO LOOK
- `src/db/index.ts`: Migration engine and connection setup.
- `src/db/schema.sql`: Baseline schema definition.
- `src/db/tasks.ts`: Example of manual `rowToDTO` mapping.
