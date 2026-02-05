# Final Logic & Architecture Audit: Lazy Flow

## 1. High-Level Logic Contradictions
- **Capture Conflict**: Spec v5 (Planer) says Tags override everything. Bot Spec says Media/URLs can override folders. This makes folder assignment unpredictable for `#w http://...`.
- **Note Lifecycle Paradox**: Notes bypass Inbox (good for speed) but are subject to Sunset (bad for persistence). A "reference note" can be archived silently if not edited, even if frequently read.
- **The "Zombie" Completion**: Frontend starts a 2s timer for completion. If user hits "Undo", the snackbar updates local state, but the background timer still fires the API call to mark it `done`.

## 2. Technical & Data Integrity Risks
- **Race Conditions**: No lock/versioning between background jobs (Sunset, Mixer, AI, Media Processing) and user edits. Sunset could archive a task *while* the user is editing it.
- **Idempotency**: Bot doesn't check for duplicate `telegram_message_id`. Retried webhooks from Telegram will create duplicate tasks.
- **Orphaned Files**: Deleting a task in the DB doesn't delete the physical file in `./uploads/`. Over time, the server will leak disk space with "deleted" media.
- **Sync Divergence**: Google Calendar sync is "shallow". Edits made in the Calendar app are often ignored if the task originated in Lazy Flow, leading to split reality.

## 3. UX & Scaling Bottlenecks
- **Mixer Starvation**: 3 random tasks/day from a 300+ backlog means a 1% chance to see any specific task. Important "backlog" items stay buried forever.
- **Tinder Fatigue**: High-volume capture (20+ tasks/day) makes the swipe-only Inbox unusable after 2-3 days of absence.
- **Correction Friction**: To fix an AI mistake (wrong folder), user must: Plan -> Find in Today -> Edit -> Change Folder. Should be possible directly in Inbox.
- **Search Absence**: Without search, the system is a "write-only" memory.

## 4. Privacy & Compliance Gaps
- **Retention Failure**: "Trash" is defined (90 days) but no auto-purge job exists. "Deleted" data is kept forever.
- **No Deletion Flow**: No `/delete_me` or button to wipe user data, files, and revoke Google tokens.
- **Bot Blocking**: No handling for "Forbidden: bot was blocked by the user", leading to constant error logs and potential Telegram API penalties.

## 5. Strategic Recommendations
- **Contract First**: Create a single "Precedence Matrix" for Capture (Tags > Notes > Media > AI).
- **Atomic Undo**: Ensure the frontend timer is cancellable or the API call is gated by local state.
- **Reference Protection**: Add an `is_protected` flag or exclude 'notes' folder from Sunset by default.
- **Cleanup Jobs**: Implement CRON for Trash purging and Filesystem sync.
- **Fast Search**: Implement a simple global search bar in the "Shelves" tab.
