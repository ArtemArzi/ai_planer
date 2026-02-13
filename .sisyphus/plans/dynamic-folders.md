# Dynamic Folders — Reviewed Implementation Plan (v2)

> This version is a corrected plan after independent architecture + plan-quality review.

## Locked decisions

- Custom folders limit: **15** per user
- Icons/colors: **preset picker** (fixed allow-list)
- Bot tags: only **`#w` / `#p` / `#i`** (no custom tag mapping)
- System folders (`work`, `personal`, `ideas`, `media`, `notes`):
  - always exist
  - slug is immutable
  - **display name is editable**
  - cannot be deleted
- Deleting a custom folder moves its tasks to slug **`personal`**

---

## Critical invariants

1. `tasks.folder` stores a **slug string** (system or custom).
2. `tasks.is_idea = 1` iff `tasks.folder = 'ideas'`, otherwise `0`.
3. System slugs are reserved and cannot be created as custom.
4. Every user always has 5 system folders (self-healing via `ensureSystemFolders`).
5. API responses remain camelCase DTOs.
6. All timestamps remain milliseconds.

---

## Corrected phase order

1) Phase 0 — Types and constants
2) Phase 1 — Schema updates (fresh DB correctness)
3) Phase 2 — Folder DB layer (including ensureSystemFolders)
4) Phase 3 — DB migration for existing installs (FK-safe rebuild)
5) Phase 4 — API routes and task validation
6) Phase 5 — AI dynamic context/classification
7) Phase 6 — Frontend dynamic folder UI
8) Phase 7 — Compatibility checks + tests

---

## Phase 0 — Types and constants

### 0.1 Shared types
**Files**: `src/lib/types.ts`, `frontend/src/api/tasks.ts`

**Changes**
- Replace union `Folder` type with slug-based types:
  - `SYSTEM_FOLDER_SLUGS`
  - `SystemFolderSlug`
  - `FolderSlug = string`
- Add `FolderDTO` and `FolderRow` interfaces.
- Update all task/capture/AI types using folder to `FolderSlug`.

**Acceptance**
- Backend and frontend compile with folder typed as string slug.

### 0.2 Folder constants
**Files**: `src/lib/folderDefaults.ts` (new)

**Changes**
- Add:
  - `MAX_CUSTOM_FOLDERS = 15`
  - icon allow-list
  - color allow-list
  - system defaults map (displayName/icon/color/position)
  - reserved slugs set (at minimum system slugs + `inbox`)

**Acceptance**
- All folder validation logic can import one source of truth.

---

## Phase 1 — Schema updates (fresh DB)

### 1.1 Update `tasks` schema for fresh installations
**Files**: `src/db/schema.sql`

**Changes**
- Change `tasks.folder` from:
  - `TEXT CHECK(folder IN (...)) DEFAULT 'personal'`
- To:
  - `TEXT NOT NULL DEFAULT 'personal'`

**Acceptance**
- Fresh DB allows inserting task with custom slug (e.g. `study`).

### 1.2 Add `folders` table
**Files**: `src/db/schema.sql`

**Changes**
- Add table:
  - `id`, `user_id`, `slug`, `display_name`, `is_system`, `icon`, `color`, `position`, `created_at`, `updated_at`
- Add constraints/indexes:
  - `UNIQUE(user_id, slug)`
  - `INDEX idx_folders_user`

**Acceptance**
- Fresh DB has folders table with uniqueness per user.

---

## Phase 2 — Folder DB layer

### 2.1 Implement `src/db/folders.ts`
**Files**: `src/db/folders.ts` (new), `src/db/index.ts` (export)

**Changes**
- Implement:
  - `ensureSystemFolders(userId)`
  - `listFolders(userId)`
  - `getFolder(userId, slug)`
  - `folderExists(userId, slug)`
  - `createFolder(userId, input)`
  - `updateFolder(userId, slug, patch)`
  - `deleteFolder(userId, slug)`
  - `slugify()`
  - row-to-dto mapper

**Important rules**
- `folderExists` and `listFolders` must call `ensureSystemFolders` first (self-healing invariant).
- Slug generation:
  - normalize + dedupe with suffix
  - reject reserved slugs
  - reject empty slug after normalization (return validation error)
- Position policy:
  - system positions fixed 0..4
  - new custom folder gets `max(position)+1`
  - default ordering: `position ASC, created_at ASC`
- System folder edit policy:
  - allowed: `display_name`
  - forbidden: `slug`, `is_system`, `icon`, `color`, `position`, delete
- Custom delete policy:
  - transaction: move tasks to `personal`, set `is_idea=0`, update timestamps, then delete folder row

**Acceptance**
- CRUD behavior matches locked decisions exactly.

### 2.2 Ensure new users get system folders
**Files**: `src/db/users.ts`

**Changes**
- After successful user upsert/create, call `ensureSystemFolders(telegramId)`.

**Acceptance**
- New user immediately has 5 system folders without calling `/folders` first.

---

## Phase 3 — Existing DB migration (FK-safe)

### 3.1 Rebuild `tasks` table safely to remove old CHECK
**Files**: `src/db/index.ts`

**Changes**
- Add migration detector based on current table SQL:
  - query `sqlite_master` for `tasks` create SQL
  - run migration only if SQL still contains `CHECK(folder IN`
- FK-safe rebuild flow:
  1. `PRAGMA foreign_keys = OFF`
  2. begin transaction
  3. create `tasks_new` with current schema (no folder CHECK)
  4. copy data with explicit column list (no `SELECT *`)
  5. drop old `tasks`
  6. rename `tasks_new` to `tasks`
  7. recreate all tasks indexes (including idempotency index)
  8. commit
  9. `PRAGMA foreign_keys = ON`
  10. run `PRAGMA foreign_key_check` and fail loudly on violations

### 3.2 Seed folders for existing users
**Files**: `src/db/index.ts`

**Changes**
- Seed via users table, not tasks table:
  - `SELECT telegram_id FROM users`
  - call `ensureSystemFolders` per user

**Acceptance**
- Existing installs migrate with no data loss.
- Users with zero tasks still get system folders.
- Post-migration DB passes foreign key check.

---

## Phase 4 — API and task validation

### 4.1 Add folders API
**Files**: `src/api/routes/folders.ts` (new), `src/api/index.ts`

**Endpoints**
- `GET /folders`
- `POST /folders`
- `PATCH /folders/:slug`
- `DELETE /folders/:slug`

**Validation**
- `displayName` length
- icon/color in allow-list
- enforce custom-folder max count
- enforce system edit/delete restrictions

**Routing**
- Mount route in API index
- Apply same rate limit middleware to `/folders`

### 4.2 Validate folder usage in task routes
**Files**: `src/api/routes/tasks.ts`, `src/db/tasks.ts`

**Changes**
- Validate folder existence for all mutation paths:
  - `POST /tasks`
  - `PATCH /tasks/:id`
  - `PATCH /tasks/batch` when `updates.folder` exists
- Keep `GET /tasks?folder=` typed as string slug (no union cast).
- Keep recurring-task clone flow consistent with folder validation.

**Acceptance**
- No API mutation can write non-existent folder slug.

---

## Phase 5 — AI dynamic folder context

### 5.1 Build folder context
**Files**: `src/lib/ai/folderContext.ts` (new), `src/db/tasks.ts` (helper query if needed)

**Changes**
- `buildFolderContext(userId)` returns:
  - all folders (slug/displayName/isSystem)
  - up to N samples per folder from recent tasks
- Query strategy must avoid N+1:
  - one query for folders
  - one query for recent tasks, grouped in memory

**Caps**
- max samples per folder: 2-3
- max sample chars per item: 120
- hard cap total prompt context size

### 5.2 Update classifier
**Files**: `src/lib/ai/classifier.ts`

**Changes**
- Classifier accepts folder context, not just text.
- Prompt explicitly says: choose exactly one slug from allowed list.
- Treat folder names and samples as data, not instructions.
- Keep strict JSON response contract.
- Improve Gemini parse robustness (not regex-only fragile parsing).

### 5.3 Update AI orchestration
**Files**: `src/lib/ai/index.ts`

**Changes**
- Fetch folder context at classification time (no stale static cache).
- Validate returned slug via `folderExists`.
- Fallback to `personal` if invalid or missing.
- Preserve existing race guard (`updatedAt > originalCreatedAt` skip).

**Acceptance**
- New folder is immediately available to AI classification.

---

## Phase 6 — Frontend dynamic folder UI

### 6.1 Frontend folders API and hooks
**Files**: `frontend/src/api/folders.ts` (new), `frontend/src/api/tasks.ts`

**Changes**
- Add folder CRUD client and hooks:
  - `useFolders`, `useCreateFolder`, `useUpdateFolder`, `useDeleteFolder`
- Change task folder typing to `string` slug.

### 6.2 Replace hardcoded folder metadata/usages
**Files**
- `frontend/src/screens/ShelvesTab.tsx`
- `frontend/src/components/FolderBadge.tsx`
- `frontend/src/components/sheets/AddTaskSheet.tsx`
- `frontend/src/components/sheets/TaskDetailSheet.tsx`
- `frontend/src/components/NotesFolderView.tsx`
- `frontend/src/components/TaskRow.tsx`
- `frontend/src/components/SwipeCard.tsx`
- `frontend/src/components/UpcomingList.tsx`

**Changes**
- Replace hardcoded folder arrays/maps with dynamic data from `useFolders()`.
- Show `displayName` from server; behavior always by slug.
- Keep system visual defaults as fallback if metadata temporarily unavailable.

### 6.3 Folder management sheet
**Files**: `frontend/src/components/sheets/FolderSheet.tsx` (new)

**Changes**
- Create/edit/delete custom folder UI.
- Preset icon/color pickers.
- System folders: rename-only UI.

**Acceptance**
- Renaming system folder updates labels across app.
- Creating/deleting custom folder updates all views without manual reload.

---

## Phase 7 — Compatibility and tests

### 7.1 Compatibility pass
**Files**: `src/lib/capture.ts`, `src/bot/handlers/commands.ts`, `src/jobs/sunset.ts`, `src/jobs/mixer.ts`

**Changes**
- `capture.ts`: keep `#w/#p/#i` mapping unchanged; update type imports if needed.
- `commands.ts`: keep static tag help (or dynamic labels if desired later).
- `sunset`/`mixer`: verify no logic depends on folder union (they rely on `is_idea`).

### 7.2 Tests
**Files**
- `src/__tests__/folders.test.ts` (new)
- `src/__tests__/folders-api.test.ts` (new)
- `src/__tests__/ai-context.test.ts` (new)
- `src/__tests__/migration-folder-check.test.ts` (new)
- existing tests updated where typing changed

**Must cover**
- system folders idempotent seeding
- system rename allowed, system delete forbidden
- custom folder limit = 15
- reserved slug rejection + slugify edge cases
- custom delete re-homes tasks and updates `is_idea`
- task endpoints reject unknown folder slug (including batch)
- migration removes folder CHECK and preserves indexes/data
- AI context includes all folders and capped samples

---

## Go / No-Go checklist before implementation start

1. `schema.sql` updated for fresh DB (no folder CHECK).
2. Migration spec explicitly FK-safe and idempotent.
3. Reserved slug policy documented and tested.
4. System-folder edit/delete policy unambiguous.
5. `ensureSystemFolders` invoked in guaranteed paths.
6. Task route validation includes batch updates.
7. `is_idea` invariant explicitly enforced on mass moves.
8. AI prompt size/cost caps defined.
9. Frontend file list includes all folder consumers.
10. Test plan includes migration verification, not only unit behavior.
