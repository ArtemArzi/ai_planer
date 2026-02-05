# LAZY FLOW: Backend Specification v1.0

> **AI-Ready Specification** - Designed for implementation by Claude/GPT agents
> **Target Stack**: Bun + Hono + SQLite + grammY + TypeScript

---

## ⚠️ CROSS-SPEC CONVENTIONS (READ FIRST!)

> **CRITICAL**: These conventions MUST be followed for consistency across all specs.

### API Response Field Naming

| Context | Convention | Example |
|---------|------------|---------|
| **JSON API Responses** | camelCase | `userId`, `createdAt`, `googleEventId` |
| **SQLite Columns** | snake_case | `user_id`, `created_at`, `google_event_id` |

**Transformation Rule**: Always convert snake_case → camelCase when serializing DB results to JSON.

```typescript
// Helper function for all API responses
function toDTO<T extends Record<string, any>>(dbRow: T): T {
  return Object.fromEntries(
    Object.entries(dbRow).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), // snake_case → camelCase
      value
    ])
  ) as T;
}

// Usage in endpoints
api.get('/tasks', authMiddleware, async (c) => {
  const tasks = await db.getTasks({ userId });
  return c.json(tasks.map(toDTO)); // ← Always transform!
});
```

### Timestamp Format

ALL timestamps in JSON responses are **milliseconds** (JavaScript `Date.now()` format).

### Required DTO Shapes (Frontend Expects These!)

```typescript
interface TaskDTO {
  id: string;
  userId: number;
  content: string;
  type: 'task' | 'note';
  status: 'inbox' | 'active' | 'backlog' | 'done' | 'archived' | 'deleted';
  folder: 'work' | 'personal' | 'ideas' | 'media' | 'notes';
  isIdea: boolean;
  isMixerResurfaced: boolean;
  deadline: number | null;         // ms timestamp
  scheduledDate: string | null;    // YYYY-MM-DD
  scheduledTime: string | null;    // HH:MM
  googleEventId: string | null;
  createdAt: number;               // ms
  updatedAt: number;               // ms
  lastInteractionAt: number;       // ms
  lastSeenAt: number | null;       // ms
  completedAt: number | null;      // ms
  deletedAt: number | null;        // ms
  source: 'bot' | 'miniapp' | 'calendar';
  telegramMessageId: number | null;
}

interface UserDTO {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  timezone: string;
  notificationsEnabled: boolean;   // NOT number!
  morningDigestTime: string;
  deadlineReminderMinutes: number;
  storiesNotifications: boolean;   // NOT number!
  aiClassificationEnabled: boolean; // NOT number!
  hasGoogleCalendar: boolean;      // Derived, NOT raw token!
  createdAt: number;
}
```

---

## 1. SYSTEM OVERVIEW

### 1.1 Product Context
LAZY FLOW is a Telegram-native task manager following the philosophy:
- **"Capture = Exhale, Review = Inhale"**
- Minimal cognitive load
- Maximum laziness in UX

### 1.2 Architecture

```
[Telegram Bot] <--grammY--> [Bun/Hono Server] <--bun:sqlite--> [SQLite DB]
                                   |
                                   +--> [REST API] <--> [Mini App]
                                   |
                                   +--> [AI Service] (OpenAI/Gemini)
                                   |
                                   +--> [Google Calendar API]
```

### 1.3 Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Bun | Fast cold start (~50ms), native SQLite |
| Framework | Hono | 13KB, 5x faster than Express |
| Database | SQLite (WAL mode) | Simple, no external deps, sufficient for 1000 users |
| Bot Library | grammY | TypeScript, modular, Bun-compatible |
| AI | OpenAI GPT-4o-mini + Gemini Flash | Classification, Speech-to-Text |
| Cron | croner | In-process, zero dependencies |
| Hosting | Beget + Coolify | Git-push deploy, persistent storage |

---

## 2. DATABASE SCHEMA

### 2.1 SQLite Configuration

```sql
-- Enable WAL mode for concurrent reads
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB cache
PRAGMA foreign_keys = ON;
```

> **⚠️ CRITICAL: Timestamp Convention**
> 
> ALL timestamps in this system use **MILLISECONDS** (JavaScript `Date.now()` format).
> SQLite's `unixepoch()` returns seconds, so we multiply by 1000.
> 
> ```sql
> -- CORRECT: milliseconds
> created_at INTEGER DEFAULT (unixepoch() * 1000)
> 
> -- WRONG: seconds (DO NOT USE)
> created_at INTEGER DEFAULT (unixepoch())
> ```

### 2.2 Tables

#### users

```sql
CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT DEFAULT 'ru',
  
  -- Timezone (IANA format, auto-detected from Telegram)
  timezone TEXT DEFAULT 'Europe/Moscow',
  
  -- Notification Settings
  notifications_enabled INTEGER DEFAULT 1,
  morning_digest_time TEXT DEFAULT '09:00', -- HH:MM format
  deadline_reminder_minutes INTEGER DEFAULT 60, -- Configurable: 15, 30, 60, etc.
  stories_notifications INTEGER DEFAULT 1,
  
  -- Google Calendar Integration
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry INTEGER, -- Unix timestamp
  google_calendar_id TEXT, -- Which calendar to sync with
  
  -- AI Settings
  ai_classification_enabled INTEGER DEFAULT 1,
  
  -- Metadata
  last_mixer_run INTEGER, -- Unix timestamp (ms), for idempotency
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  updated_at INTEGER DEFAULT (unixepoch() * 1000)
);
```

#### tasks

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, -- UUID v7 (time-ordered)
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  
  -- Content
  content TEXT NOT NULL,
  type TEXT CHECK(type IN ('task', 'note')) DEFAULT 'task',
  
  -- Lifecycle
  status TEXT CHECK(status IN ('inbox', 'active', 'backlog', 'done', 'archived', 'deleted')) DEFAULT 'inbox',
  folder TEXT CHECK(folder IN ('work', 'personal', 'ideas', 'media', 'notes')) DEFAULT 'personal',
  
  -- Flags
  is_idea INTEGER DEFAULT 0, -- TRUE if folder='ideas', exempt from Sunset
  is_mixer_resurfaced INTEGER DEFAULT 0, -- Marked by Mixer engine
  
  -- Scheduling
  deadline INTEGER, -- Unix timestamp (ms)
  scheduled_date TEXT, -- YYYY-MM-DD format for "smart grid" scheduling
  scheduled_time TEXT, -- HH:MM format (Morning/Afternoon/Evening)
  
  -- Google Calendar Sync
  google_event_id TEXT, -- For two-way sync
  
  -- Timestamps (ALL in milliseconds!)
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  updated_at INTEGER DEFAULT (unixepoch() * 1000),
  last_interaction_at INTEGER DEFAULT (unixepoch() * 1000), -- For Sunset engine
  last_seen_at INTEGER, -- For Mixer cooldown (14 days), ms
  completed_at INTEGER, -- ms
  deleted_at INTEGER, -- ms
  
  -- Source tracking
  source TEXT CHECK(source IN ('bot', 'miniapp', 'calendar')) DEFAULT 'bot',
  telegram_message_id INTEGER -- For edit sync
);

-- Indexes for common queries
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_folder ON tasks(user_id, folder);
CREATE INDEX idx_tasks_deadline ON tasks(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_tasks_mixer ON tasks(user_id, status, last_seen_at) WHERE status = 'backlog';
CREATE INDEX idx_tasks_sunset ON tasks(status, last_interaction_at) WHERE status = 'active';

-- ⚠️ CRITICAL: Idempotency for Telegram webhooks
-- Prevents duplicate tasks when Telegram retries failed webhooks
CREATE UNIQUE INDEX idx_tasks_telegram_idempotency 
  ON tasks(user_id, telegram_message_id) 
  WHERE telegram_message_id IS NOT NULL;
```

#### media

```sql
CREATE TABLE media (
  id TEXT PRIMARY KEY, -- UUID v7
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  
  -- File info
  type TEXT CHECK(type IN ('photo', 'document', 'voice', 'link')) NOT NULL,
  file_path TEXT, -- Local path: ./uploads/{user_id}/{id}.{ext}
  file_size INTEGER, -- Bytes
  mime_type TEXT,
  original_filename TEXT,
  
  -- Telegram file reference (for re-download if needed)
  telegram_file_id TEXT,
  
  -- Link preview (OG tags)
  url TEXT,
  link_title TEXT,
  link_description TEXT,
  link_image_url TEXT,
  
  -- Voice transcription
  transcription TEXT,
  transcription_status TEXT CHECK(transcription_status IN ('pending', 'completed', 'failed')),
  
  -- Metadata
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE INDEX idx_media_task ON media(task_id);
```

#### media_queue

> **Media Processing Queue** - Handles async transcription with rate limiting and retries.

```sql
CREATE TABLE media_queue (
  id TEXT PRIMARY KEY, -- UUID v7
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  
  -- Job info
  job_type TEXT CHECK(job_type IN ('transcription', 'link_preview')) NOT NULL,
  file_path TEXT, -- For transcription jobs
  url TEXT, -- For link preview jobs
  
  -- Status tracking
  status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Timing (ALL in milliseconds!)
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  next_attempt_at INTEGER DEFAULT (unixepoch() * 1000), -- For retry scheduling
  completed_at INTEGER, -- ms
  
  -- Error tracking
  last_error TEXT
);

CREATE INDEX idx_media_queue_pending ON media_queue(status, next_attempt_at) 
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_media_queue_user ON media_queue(user_id, created_at);
```

### 2.3 Capture Precedence Matrix

> **CRITICAL**: This defines the priority order for folder/type assignment.

| Priority | Rule | Detection | Result |
|----------|------|-----------|--------|
| 1 | **Explicit Tag** | `#w`, `#p`, `#i` at start | Tag → folder (even if content is long!) |
| 2 | **Content Length** (no tag) | >500 chars | type='note', folder='notes' |
| 3 | **Media Attachment** (no tag) | photo/doc/voice | folder='media' |
| 4 | **URL Detection** (no tag) | `https?://...` | folder='media' |
| 5 | **AI Classification** | Default fallback | AI decides work/personal/ideas |

**Examples**:
- `#w http://example.com` → folder='work', type='task', URL saved as media
- `#w [600 chars]` → folder='work', **type='note'** (long content = note display)
- `[600 chars, no tag]` → folder='notes', type='note'
- `http://example.com` → folder='media', type='task'
- `Buy milk` → AI classifies → likely 'personal'

**Key Insight**: 
- `type` is determined by content length (>500 = note)
- `folder` is determined by tag (if present) or auto-detection (if no tag)
- A note CAN live in work/personal/ideas folder if user explicitly tagged it!

### 2.4 Type Auto-Detection Logic

```typescript
// Task vs Note detection
function determineType(content: string): 'task' | 'note' {
  return content.length > 500 ? 'note' : 'task';
}

// Folder auto-assignment from Notes
function determineFolder(content: string, type: 'task' | 'note'): Folder {
  if (type === 'note') return 'notes';
  // Otherwise, AI classification or tag-based
}
```

### 2.4 NOTE Entity Definition

> **Notes are long-form content items (>500 chars) with distinct lifecycle.**

| Aspect | Behavior |
|--------|----------|
| **Creation** | Auto-classified when content > 500 chars |
| **Initial Status** | `active` (bypasses Inbox) |
| **Initial Folder** | `notes` (system folder, protected) |
| **Completion** | Optional - user can mark done, but not required |
| **Deadline** | Not supported (deadline always NULL) |
| **Sunset** | ❌ **EXCLUDED** (notes are reference material, never auto-archive) |
| **Mixer** | ✅ Applies (resurfaces from backlog like tasks) |

```typescript
// Note creation - bypasses Inbox
async function createNote(userId: number, content: string): Promise<Task> {
  return db.createTask({
    userId,
    content,
    type: 'note',
    status: 'active',        // ← Bypass inbox!
    folder: 'notes',
    deadline: null,          // ← Notes never have deadlines
    isIdea: false
  });
}
```

### 2.5 DONE Status Lifecycle

> **Completed tasks/notes follow a defined lifecycle.**

| Stage | Duration | Location | Visibility |
|-------|----------|----------|------------|
| Completed | 0-7 days | `done` status | Visible in "Выполнено" section |
| Auto-archived | 7+ days | `archived` status | Moved to Archive |
| Permanent | Forever | `archived` | Restorable anytime |

```typescript
// Completion handler
async function completeTask(taskId: string): Promise<void> {
  await db.updateTask(taskId, {
    status: 'done',
    completedAt: Date.now()
  });
}

// Restore from done/archived
async function restoreTask(taskId: string): Promise<void> {
  await db.updateTask(taskId, {
    status: 'active',
    completedAt: null,
    lastInteractionAt: Date.now()
  });
}
```

**DONE Auto-Archive Cron** (runs with Sunset):

```typescript
// Archive completed tasks older than 7 days
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

await db.query(`
  UPDATE tasks 
  SET status = 'archived'
  WHERE status = 'done'
    AND completed_at < ?
`, [sevenDaysAgo]);
```

---

## 3. TELEGRAM BOT

### 3.1 Bot Setup (grammY)

```typescript
import { Bot, webhookCallback } from 'grammy';
import { Hono } from 'hono';

const bot = new Bot(process.env.BOT_TOKEN!);
const app = new Hono();

// Webhook for production
app.post('/webhook/:secret', async (c) => {
  const secret = c.req.param('secret');
  if (secret !== process.env.WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }
  return webhookCallback(bot, 'hono')(c);
});

// Development: Long polling
if (process.env.NODE_ENV === 'development') {
  bot.start();
}
```

### 3.2 Message Capture Logic

```typescript
// Priority order:
// 1. Check for explicit tags (#w, #p, #i)
// 2. Check for media/links
// 3. AI classification (async)

interface CaptureResult {
  content: string;
  folder: Folder;
  type: 'task' | 'note';
  mediaType?: 'photo' | 'document' | 'voice' | 'link';
  needsAiClassification: boolean;
}

async function processMessage(message: Message): Promise<CaptureResult> {
  const text = message.text || message.caption || '';
  
  // 1. Tag detection (regex on first word)
  const tagMatch = text.match(/^#([wpi])\b/i);
  if (tagMatch) {
    const folder = {
      'w': 'work',
      'p': 'personal', 
      'i': 'ideas'
    }[tagMatch[1].toLowerCase()] as Folder;
    
    return {
      content: text.replace(/^#[wpi]\s*/i, ''),
      folder,
      type: determineType(text),
      needsAiClassification: false
    };
  }
  
  // 2. Media/Link detection
  if (message.photo || message.document || message.voice) {
    return {
      content: text || 'Media attachment',
      folder: 'media',
      type: 'task',
      mediaType: message.photo ? 'photo' : message.document ? 'document' : 'voice',
      needsAiClassification: false
    };
  }
  
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    return {
      content: text,
      folder: 'media',
      type: 'task',
      mediaType: 'link',
      needsAiClassification: false
    };
  }
  
  // 3. Determine type first
  const type = determineType(text);
  
  // 4. Notes bypass inbox and go directly to notes folder
  if (type === 'note') {
    return {
      content: text,
      folder: 'notes',
      type: 'note',
      status: 'active',           // ← Notes bypass inbox!
      needsAiClassification: false // Notes don't need classification
    };
  }
  
  // 5. Regular tasks need AI classification
  return {
    content: text,
    folder: 'personal', // Default, will be updated by AI
    type: 'task',
    status: 'inbox',
    needsAiClassification: true
  };
}
```

### 3.3 Response Pattern

```typescript
bot.on('message', async (ctx) => {
  try {
    const result = await processMessage(ctx.message);
    
    // Create task immediately (async classification)
    const task = await createTask({
      userId: ctx.from.id,
      content: result.content,
      folder: result.folder,
      type: result.type,
      status: 'inbox',
      telegramMessageId: ctx.message.message_id
    });
    
    // Reply instantly
    await ctx.reply('✓');
    
    // Trigger async processes
    if (result.needsAiClassification) {
      classifyTaskAsync(task.id, task.createdAt); // Pass creation time for race detection
    }
    
    if (result.mediaType) {
      processMediaAsync(task.id, ctx.message); // Download & process
    }
    
  } catch (error) {
    console.error('Message processing failed:', error);
    await ctx.reply('✓'); // Still acknowledge, handle error silently
  }
});
```

### 3.4 Message Edit Handling

```typescript
bot.on('edited_message', async (ctx) => {
  const task = await db.findTaskByTelegramMessageId(
    ctx.from.id,
    ctx.editedMessage.message_id
  );
  
  if (task) {
    await updateTask(task.id, {
      content: ctx.editedMessage.text || ctx.editedMessage.caption,
      updatedAt: Date.now()
    });
  }
});
```

---

## 4. AI CLASSIFICATION

### 4.1 Provider Abstraction

```typescript
interface AIClassifier {
  classify(text: string): Promise<{
    folder: 'work' | 'personal' | 'ideas';
    confidence: number;
  }>;
}

class OpenAIClassifier implements AIClassifier {
  async classify(text: string) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Classify this task into one of three categories:
          - work: Professional tasks, meetings, deadlines, projects
          - personal: Personal errands, health, family, shopping
          - ideas: Creative thoughts, someday/maybe, inspiration
          
          Respond with JSON: {"folder": "work|personal|ideas", "confidence": 0.0-1.0}`
      }, {
        role: 'user',
        content: text
      }],
      response_format: { type: 'json_object' },
      timeout: 10000 // 10s hard timeout
    });
    
    return JSON.parse(response.choices[0].message.content!);
  }
}

class GeminiClassifier implements AIClassifier {
  // Similar implementation for Google Gemini
}
```

### 4.2 Classification Flow (Async)

> **⚠️ RACE CONDITION PROTECTION**: AI classification must NOT overwrite user's manual changes.
> We pass `originalCreatedAt` and check if task was modified since creation.

```typescript
async function classifyTaskAsync(taskId: string, originalCreatedAt: number): Promise<void> {
  const task = await db.getTask(taskId);
  if (!task) return;
  
  // ⚠️ RACE CONDITION CHECK: Don't overwrite if user already modified
  // If updatedAt > createdAt, user has edited the task - abort classification
  if (task.updatedAt > originalCreatedAt) {
    console.log(`[AI] Skipping classification for ${taskId}: user already modified`);
    return;
  }
  
  const user = await db.getUser(task.userId);
  if (!user.aiClassificationEnabled) return;
  
  try {
    // Try OpenAI first
    const result = await withTimeout(
      openaiClassifier.classify(task.content),
      10000 // 10s timeout
    );
    
    // Double-check before update (task might have changed during AI call)
    const freshTask = await db.getTask(taskId);
    if (freshTask.updatedAt > originalCreatedAt) {
      console.log(`[AI] Aborting: task ${taskId} was modified during classification`);
      return;
    }
    
    await updateTask(taskId, { folder: result.folder });
    
  } catch (openaiError) {
    try {
      // Fallback to Gemini
      const result = await withTimeout(
        geminiClassifier.classify(task.content),
        10000
      );
      
      // Same double-check
      const freshTask = await db.getTask(taskId);
      if (freshTask.updatedAt > originalCreatedAt) return;
      
      await updateTask(taskId, { folder: result.folder });
      
    } catch (geminiError) {
      // Both failed: keep default 'personal' folder
      console.error('AI classification failed:', { openaiError, geminiError });
      // Task stays with folder='personal' (default)
    }
  }
}
```

---

## 5. REST API (Mini App)

### 5.1 Authentication Middleware

```typescript
import { createHmac } from 'crypto';

interface TelegramInitData {
  user: {
    id: number;
    first_name: string;
    username?: string;
  };
  auth_date: number;
  hash: string;
}

function validateInitData(initData: string): TelegramInitData | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  
  // Check auth_date freshness (24 hours max)
  const authDate = parseInt(params.get('auth_date') || '0');
  const maxAge = 24 * 60 * 60; // 24 hours in seconds
  if (Date.now() / 1000 - authDate > maxAge) {
    return null;
  }
  
  // Sort and create data string
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  
  // HMAC-SHA256 verification
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN!)
    .digest();
  
  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  if (hash !== expectedHash) {
    return null;
  }
  
  return {
    user: JSON.parse(params.get('user')!),
    auth_date: authDate,
    hash: hash!
  };
}

// Hono middleware
const authMiddleware = async (c: Context, next: Next) => {
  const initData = c.req.header('X-Telegram-Init-Data');
  
  if (!initData) {
    return c.json({ error: 'Missing init data' }, 401);
  }
  
  const data = validateInitData(initData);
  if (!data) {
    return c.json({ error: 'Invalid init data' }, 401);
  }
  
  c.set('userId', data.user.id);
  c.set('user', data.user);
  
  await next();
};
```

### 5.2 API Endpoints

```typescript
const api = new Hono();

// Health check (for Coolify)
api.get('/health', (c) => c.json({ status: 'ok' }));

// User profile
api.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await db.getUser(userId);
  
  // ⚠️ SECURITY: Never expose OAuth tokens to frontend!
  // Return only safe, user-facing fields
  return c.json({
    telegramId: user.telegram_id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    timezone: user.timezone,
    notificationsEnabled: user.notifications_enabled,
    morningDigestTime: user.morning_digest_time,
    deadlineReminderMinutes: user.deadline_reminder_minutes,
    storiesNotifications: user.stories_notifications,
    aiClassificationEnabled: user.ai_classification_enabled,
    hasGoogleCalendar: !!user.google_refresh_token, // Boolean only!
    createdAt: user.created_at
  });
});

api.patch('/me/settings', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const settings = await c.req.json();
  
  // Validate settings
  const allowedFields = [
    'timezone', 'notifications_enabled', 'morning_digest_time',
    'deadline_reminder_minutes', 'stories_notifications', 'ai_classification_enabled'
  ];
  
  const filteredSettings = Object.fromEntries(
    Object.entries(settings).filter(([k]) => allowedFields.includes(k))
  );
  
  await db.updateUser(userId, filteredSettings);
  return c.json({ success: true });
});

// === TIMEZONE-AWARE "TODAY" CALCULATION ===
// Critical: "Today" is determined by user's timezone, not server UTC
// ⚠️ WARNING: toLocaleString hack is NOT DST-safe for date math!
// Use proper timezone library (Temporal API or date-fns-tz) in production

function getUserToday(user: User): { start: number; end: number } {
  const tz = user.timezone || 'Europe/Moscow';
  
  // Proper DST-safe implementation using Intl.DateTimeFormat
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Get today's date string in user's timezone (YYYY-MM-DD)
  const todayStr = formatter.format(new Date());
  
  // Parse as midnight in user's timezone
  // Note: This creates a Date at midnight UTC, then we adjust
  const [year, month, day] = todayStr.split('-').map(Number);
  
  // Create start/end using timezone offset at that specific date
  // This handles DST transitions correctly
  const startOfDayLocal = new Date(`${todayStr}T00:00:00`);
  const endOfDayLocal = new Date(`${todayStr}T23:59:59.999`);
  
  // Get timezone offset at start of day (handles DST)
  const tzOffsetMinutes = getTimezoneOffset(tz, startOfDayLocal);
  
  return {
    start: startOfDayLocal.getTime() - (tzOffsetMinutes * 60 * 1000),
    end: endOfDayLocal.getTime() - (tzOffsetMinutes * 60 * 1000)
  };
}

// Helper: Get timezone offset in minutes for a specific date
// This is DST-aware because it uses the actual date
function getTimezoneOffset(tz: string, date: Date): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  return (utcDate.getTime() - tzDate.getTime()) / (60 * 1000);
}

// Tasks CRUD
api.get('/tasks', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const status = c.req.query('status'); // inbox, active, backlog, done
  const folder = c.req.query('folder');
  const cursor = c.req.query('cursor'); // For pagination
  const limit = parseInt(c.req.query('limit') || '50');
  
  const tasks = await db.getTasks({ userId, status, folder, cursor, limit });
  return c.json(tasks);
});

api.post('/tasks', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  // Validate content
  if (!body.content || typeof body.content !== 'string') {
    return c.json({ error: 'Content is required' }, 400);
  }
  
  const trimmedContent = body.content.trim();
  if (!trimmedContent) {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }
  
  if (trimmedContent.length > 10000) {
    return c.json({ error: 'Content too long (max 10000 chars)' }, 400);
  }
  
  // ⚠️ Validate deadline is not in the past
  if (body.deadline && body.deadline < Date.now()) {
    return c.json({ error: 'Deadline cannot be in the past' }, 400);
  }
  
  const task = await createTask({
    userId,
    content: body.content,
    folder: body.folder || 'personal',
    status: body.status || 'active', // Mini App creates directly in Today
    type: determineType(body.content),
    source: 'miniapp'
  });
  
  return c.json(task, 201);
});

api.patch('/tasks/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  const updates = await c.req.json();
  
  // Verify ownership
  const task = await db.getTask(taskId);
  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  // ⚠️ CRITICAL: Optimistic Locking for Concurrent Edits
  // Client must send expectedUpdatedAt to prevent lost updates
  if (updates.expectedUpdatedAt !== undefined) {
    if (task.updatedAt !== updates.expectedUpdatedAt) {
      // Another client modified this task - return conflict with fresh data
      return c.json({ 
        error: 'Conflict: task was modified', 
        code: 'CONFLICT',
        currentTask: task 
      }, 409);
    }
    delete updates.expectedUpdatedAt; // Don't persist this field
  }
  
  // ⚠️ Validate deadline is not in the past (if being set)
  if (updates.deadline && updates.deadline < Date.now()) {
    return c.json({ error: 'Deadline cannot be in the past' }, 400);
  }
  
  // Update last_interaction_at for Sunset tracking
  updates.lastInteractionAt = Date.now();
  updates.updatedAt = Date.now(); // Always update for conflict detection
  
  // Handle status transitions
  if (updates.status === 'done' && task.status !== 'done') {
    updates.completedAt = Date.now();
  }
  if (updates.status === 'deleted') {
    updates.deletedAt = Date.now();
  }
  
  // Handle folder change affecting is_idea
  if (updates.folder) {
    updates.isIdea = updates.folder === 'ideas';
  }
  
  await db.updateTask(taskId, updates);
  
  // Return updated task for client sync
  const updatedTask = await db.getTask(taskId);
  return c.json(updatedTask);
});

api.delete('/tasks/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  
  const task = await db.getTask(taskId);
  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  // Soft delete
  await db.updateTask(taskId, { 
    status: 'deleted', 
    deletedAt: Date.now() 
  });
  
  return c.json({ success: true });
});

// Mixer endpoint (called on app open)
api.post('/mixer/run', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const tasks = await runMixer(userId);
  return c.json({ resurfaced: tasks });
});

// Stats for potential dashboard
api.get('/tasks/stats', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const stats = await db.getTaskStats(userId);
  return c.json(stats);
});

// === PROTECTED FILE ACCESS ===
// ⚠️ SECURITY: Files must NOT be served statically!
// All file access goes through this authenticated endpoint
api.get('/files/:mediaId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const mediaId = c.req.param('mediaId');
  
  const media = await db.getMedia(mediaId);
  
  // Verify ownership
  if (!media || media.userId !== userId) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  if (!media.filePath) {
    return c.json({ error: 'No file' }, 404);
  }
  
  // Stream file with correct content type
  const file = Bun.file(media.filePath);
  
  if (!await file.exists()) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  return new Response(file.stream(), {
    headers: {
      'Content-Type': media.mimeType || 'application/octet-stream',
      'Content-Length': String(media.fileSize || file.size),
      'Cache-Control': 'private, max-age=86400' // 24h, private cache only
    }
  });
});

// === GDPR DATA EXPORT ===
// User can download all their data
api.get('/export', authMiddleware, async (c) => {
  const userId = c.get('userId');
  
  // Gather all user data
  const user = await db.getUser(userId);
  const tasks = await db.query('SELECT * FROM tasks WHERE user_id = ?', [userId]);
  const media = await db.query('SELECT * FROM media WHERE user_id = ?', [userId]);
  
  // Remove sensitive fields
  const safeUser = {
    telegramId: user.telegram_id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    timezone: user.timezone,
    settings: {
      notificationsEnabled: user.notifications_enabled,
      morningDigestTime: user.morning_digest_time,
      aiClassificationEnabled: user.ai_classification_enabled
    },
    createdAt: user.created_at
    // NO tokens or OAuth data!
  };
  
  const exportData = {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    tasks: tasks.map(t => ({
      id: t.id,
      content: t.content,
      type: t.type,
      status: t.status,
      folder: t.folder,
      deadline: t.deadline,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      completedAt: t.completed_at
    })),
    mediaCount: media.length,
    // Note: actual media files not included in JSON export
    // User can request them separately via /files/:mediaId
  };
  
  return c.json(exportData, 200, {
    'Content-Disposition': `attachment; filename="lazyflow-export-${userId}-${Date.now()}.json"`
  });
});

// Google Calendar
api.get('/calendar/connect', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const authUrl = generateGoogleAuthUrl(userId);
  return c.json({ url: authUrl });
});

api.get('/calendar/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state'); // Contains userId
  
  const tokens = await exchangeCodeForTokens(code);
  await db.updateUser(parseInt(state), {
    googleAccessToken: tokens.access_token,
    googleRefreshToken: tokens.refresh_token,
    googleTokenExpiry: Date.now() + tokens.expires_in * 1000
  });
  
  return c.redirect('/settings?calendar=connected');
});

api.delete('/calendar/disconnect', authMiddleware, async (c) => {
  const userId = c.get('userId');
  await db.updateUser(userId, {
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    googleCalendarId: null
  });
  return c.json({ success: true });
});

// Batch update tasks (for bulk actions like "Postpone All")
api.patch('/tasks/batch', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { ids, updates } = await c.req.json();
  
  if (!ids?.length || ids.length > 100) {
    return c.json({ error: 'Invalid ids (1-100 required)' }, 400);
  }
  
  // First, verify which tasks belong to user
  const placeholders = ids.map(() => '?').join(',');
  const existingTasks = await db.query(`
    SELECT id FROM tasks 
    WHERE id IN (${placeholders}) AND user_id = ?
  `, [...ids, userId]);
  
  const validIds = existingTasks.map(t => t.id);
  const skippedIds = ids.filter(id => !validIds.includes(id));
  
  if (validIds.length === 0) {
    return c.json({ 
      success: false, 
      updatedCount: 0, 
      skippedIds: ids,
      error: 'No valid tasks found' 
    }, 400);
  }
  
  // Update only valid tasks
  const validPlaceholders = validIds.map(() => '?').join(',');
  await db.query(`
    UPDATE tasks 
    SET status = ?, updated_at = ?, last_interaction_at = ?
    WHERE id IN (${validPlaceholders})
  `, [updates.status, Date.now(), Date.now(), ...validIds]);
  
  // Return detailed result for transparency
  return c.json({ 
    success: true, 
    updatedCount: validIds.length,
    updatedIds: validIds,
    skippedCount: skippedIds.length,
    skippedIds: skippedIds.length > 0 ? skippedIds : undefined
  });
});

// Global search
api.get('/tasks/search', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q');
  
  if (!query || query.length < 2) {
    return c.json([]);
  }
  
  // Simple LIKE search (can upgrade to FTS5 later)
  const results = await db.query(`
    SELECT * FROM tasks
    WHERE user_id = ?
      AND content LIKE ?
      AND status NOT IN ('deleted')
    ORDER BY updated_at DESC
    LIMIT 50
  `, [userId, `%${query}%`]);
  
  return c.json(results);
});

// User data deletion
api.delete('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  
  // 1. Revoke Google tokens if present
  const user = await db.getUser(userId);
  if (user.googleRefreshToken) {
    try {
      await revokeGoogleToken(user.googleRefreshToken);
    } catch (e) {
      console.error('Failed to revoke Google token:', e);
    }
  }
  
  // 2. Delete user files
  await fs.rm(`./uploads/${userId}`, { recursive: true, force: true });
  
  // 3. Delete from DB (CASCADE handles tasks, media)
  await db.query('DELETE FROM users WHERE telegram_id = ?', [userId]);
  
  return c.json({ success: true, message: 'All data deleted' });
});
```

### 5.3 Error Response Schema

```typescript
interface APIError {
  error: string;
  code?: string;
  details?: Record<string, any>;
}

// Example responses:
// 400: { error: "Invalid content", code: "VALIDATION_ERROR", details: { field: "content", max: 10000 } }
// 401: { error: "Invalid init data", code: "AUTH_FAILED" }
// 404: { error: "Not found", code: "NOT_FOUND" }
// 500: { error: "Internal server error", code: "INTERNAL_ERROR" }
```

### 5.4 Rate Limiting

```typescript
import { rateLimiter } from 'hono-rate-limiter';

api.use('*', rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 100, // 100 requests per minute per user
  keyGenerator: (c) => c.get('userId')?.toString() || c.req.header('CF-Connecting-IP') || 'anonymous'
}));
```

---

## 6. BACKGROUND ENGINES

### 6.1 Mixer Engine

```typescript
// Triggered on app open, max once per day per user

async function runMixer(userId: number): Promise<Task[]> {
  const user = await db.getUser(userId);
  
  // Idempotency check: max once per 24 hours
  const lastRun = user.lastMixerRun || 0;
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  if (lastRun > oneDayAgo) {
    return []; // Already ran today
  }
  
  // Find candidates (ONLY tasks from backlog, NOT notes)
  // Exclude: ideas (is_idea=1), notes (type='note')
  // Notes are reference material and should NOT be resurfaced via Mixer
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  
  const candidates = await db.query(`
    SELECT * FROM tasks
    WHERE user_id = ?
      AND status = 'backlog'
      AND type = 'task'
      AND is_idea = 0
      AND (last_seen_at IS NULL OR last_seen_at < ?)
    ORDER BY RANDOM()
    LIMIT 5
  `, [userId, fourteenDaysAgo]);
  
  // Mark as resurfaced and move to inbox
  for (const task of candidates) {
    await db.updateTask(task.id, {
      status: 'inbox',
      isMixerResurfaced: 1,
      lastSeenAt: Date.now()
    });
  }
  
  // Update last run time
  await db.updateUser(userId, { lastMixerRun: Date.now() });
  
  return candidates;
}
```

### 6.2 Sunset Engine

```typescript
import { Cron } from 'croner';

// Run at 3:00 AM server time (stagger for different timezones)
new Cron('0 3 * * *', { timezone: 'UTC' }, async () => {
  console.log('[Sunset] Starting nightly cleanup');
  
  // === PART 1: Archive stale ACTIVE tasks/notes ===
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  // Find stale active tasks (EXCLUDE notes - they never auto-archive)
  // Exclude: ideas (is_idea=1), notes (type='note'), and scheduled tasks (deadline IS NOT NULL)
  // Also exclude recently edited tasks (race condition protection)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  const staleTasks = await db.query(`
    SELECT id, user_id FROM tasks
    WHERE status = 'active'
      AND is_idea = 0
      AND type = 'task'
      AND deadline IS NULL
      AND last_interaction_at < ?
      AND updated_at < ?
  `, [thirtyDaysAgo, oneHourAgo]);
  
  // Group by user for notification
  const userTasks = new Map<number, string[]>();
  
  for (const task of staleTasks) {
    await db.updateTask(task.id, { status: 'archived' });
    
    if (!userTasks.has(task.user_id)) {
      userTasks.set(task.user_id, []);
    }
    userTasks.get(task.user_id)!.push(task.id);
  }
  
  // Store notification data for "Ghost Trail" toast on next app open
  for (const [userId, taskIds] of userTasks) {
    await db.storeSunsetNotification(userId, taskIds.length);
  }
  
  console.log(`[Sunset] Archived ${staleTasks.length} stale tasks for ${userTasks.size} users`);
  
  // === PART 2: Archive old DONE tasks (EXCLUDE notes!) ===
  // Notes marked as "done" should stay visible - they're reference material
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  
  const oldDoneTasks = await db.query(`
    UPDATE tasks 
    SET status = 'archived'
    WHERE status = 'done'
      AND type = 'task'
      AND completed_at < ?
    RETURNING id
  `, [sevenDaysAgo]);
  
  console.log(`[Sunset] Auto-archived ${oldDoneTasks.length} completed TASKS (notes excluded)`);
});
```

### 6.3 Notification Jobs

```typescript
// Morning Digest (runs every minute, sends at user's configured time)
new Cron('* * * * *', async () => {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  
  // Find users whose digest time matches current UTC time
  const users = await db.query(`
    SELECT * FROM users
    WHERE notifications_enabled = 1
      AND morning_digest_time IS NOT NULL
  `);
  
  for (const user of users) {
    const [hour, minute] = user.morningDigestTime.split(':').map(Number);
    const userNow = convertToTimezone(now, user.timezone);
    
    if (userNow.getHours() === hour && userNow.getMinutes() === minute) {
      await sendMorningDigest(user);
    }
  }
});

async function sendMorningDigest(user: User): Promise<void> {
  const inboxCount = await db.countTasks(user.telegramId, 'inbox');
  const activeCount = await db.countTasks(user.telegramId, 'active');
  
  if (inboxCount === 0 && activeCount === 0) return;
  
  let message = '';
  if (inboxCount > 0) {
    message += `📥 ${inboxCount} задач в Inbox\n`;
  }
  if (activeCount > 0) {
    message += `🎯 ${activeCount} задач на сегодня`;
  }
  
  await bot.api.sendMessage(user.telegramId, message);
}

// Deadline Reminders (runs every minute)
new Cron('* * * * *', async () => {
  const users = await db.query(`
    SELECT DISTINCT u.* FROM users u
    JOIN tasks t ON t.user_id = u.telegram_id
    WHERE t.deadline IS NOT NULL
      AND t.status IN ('inbox', 'active', 'backlog')
      AND u.notifications_enabled = 1
  `);
  
  for (const user of users) {
    const reminderWindow = user.deadlineReminderMinutes * 60 * 1000; // Convert to ms
    const windowStart = Date.now();
    const windowEnd = Date.now() + reminderWindow + 60000; // +1 minute buffer
    
    const upcomingTasks = await db.query(`
      SELECT * FROM tasks
      WHERE user_id = ?
        AND deadline BETWEEN ? AND ?
        AND status IN ('inbox', 'active', 'backlog')
    `, [user.telegramId, windowStart, windowEnd]);
    
    for (const task of upcomingTasks) {
      // Check if already notified (store in separate table or task field)
      if (!task.deadlineNotified) {
        await bot.api.sendMessage(
          user.telegramId,
          `⏰ Напоминание: "${task.content.slice(0, 50)}..."`
        );
        await db.updateTask(task.id, { deadlineNotified: 1 });
      }
    }
  }
});

// Stories Reminder (Tuesday and Friday at 10:00 user time)
new Cron('* * * * *', async () => {
  const now = new Date();
  
  const users = await db.query(`
    SELECT * FROM users
    WHERE stories_notifications = 1
  `);
  
  for (const user of users) {
    const userNow = convertToTimezone(now, user.timezone);
    const dayOfWeek = userNow.getDay(); // 0=Sun, 2=Tue, 5=Fri
    
    if ((dayOfWeek === 2 || dayOfWeek === 5) && 
        userNow.getHours() === 10 && 
        userNow.getMinutes() === 0) {
      
      const ideasCount = await db.countTasks(user.telegramId, 'ideas');
      if (ideasCount > 0) {
        await bot.api.sendMessage(
          user.telegramId,
          `💡 Новые идеи ждут вас! ${ideasCount} идей в архиве.`
        );
      }
    }
  }
});
```

### 6.4 Cleanup Jobs

```typescript
// Trash Auto-Purge: Permanently delete tasks older than 90 days
new Cron('0 5 * * *', { timezone: 'UTC' }, async () => { // Daily 5 AM
  console.log('[Purge] Starting trash cleanup');
  
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  
  // Get tasks to delete (need file paths for cleanup)
  const toDelete = await db.query(`
    SELECT t.id, m.file_path FROM tasks t
    LEFT JOIN media m ON m.task_id = t.id
    WHERE t.status = 'deleted'
      AND t.deleted_at < ?
  `, [ninetyDaysAgo]);
  
  // Delete files
  for (const item of toDelete) {
    if (item.file_path) {
      await fs.unlink(item.file_path).catch(() => {});
    }
  }
  
  // Delete from DB (CASCADE handles media records)
  await db.query(`
    DELETE FROM tasks 
    WHERE status = 'deleted' AND deleted_at < ?
  `, [ninetyDaysAgo]);
  
  console.log(`[Purge] Permanently deleted ${toDelete.length} tasks`);
});

// Orphaned Files Cleanup: Remove files not in database
new Cron('0 4 * * 0', { timezone: 'UTC' }, async () => { // Sunday 4 AM
  console.log('[Cleanup] Starting orphaned files cleanup');
  
  // Get all file paths from media table
  const mediaFiles = await db.query('SELECT file_path FROM media WHERE file_path IS NOT NULL');
  const dbPaths = new Set(mediaFiles.map(m => m.file_path));
  
  // Scan uploads directory
  async function scanDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await scanDirectory(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Directory doesn't exist
    }
    return files;
  }
  
  const uploadedFiles = await scanDirectory('./uploads');
  
  // Delete files not in DB
  let deleted = 0;
  for (const filePath of uploadedFiles) {
    if (!dbPaths.has(filePath)) {
      await fs.unlink(filePath).catch(() => {});
      deleted++;
    }
  }
  
  console.log(`[Cleanup] Deleted ${deleted} orphaned files`);
});

// Media Queue Cleanup: Remove old completed/failed jobs
new Cron('0 5 * * *', { timezone: 'UTC' }, async () => { // Daily 5 AM
  console.log('[Cleanup] Starting media queue cleanup');
  
  const deleted = await cleanupOldQueueJobs(); // From section 7.2.6
  
  console.log(`[Cleanup] Removed ${deleted} old media queue jobs`);
});
```

### 6.5 Server Startup Jobs

```typescript
// ⚠️ CRITICAL: Recover stuck jobs on server restart
// Jobs may be in 'processing' state if server crashed mid-processing
async function recoverStuckJobs(): Promise<void> {
  const stuckJobs = await db.query(`
    UPDATE media_queue 
    SET status = 'pending', 
        next_attempt_at = ?
    WHERE status = 'processing'
    RETURNING id
  `, [Date.now()]);
  
  if (stuckJobs.length > 0) {
    console.log(`[Recovery] Reset ${stuckJobs.length} stuck jobs to pending`);
  }
}

// Run recovery then start processor
await recoverStuckJobs();
startMediaQueueProcessor(); // From section 7.2.3

console.log('🚀 All background jobs initialized');
```

---

## 7. MEDIA HANDLING

### 7.1 File Storage

```typescript
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = './uploads';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

async function saveFile(
  userId: number,
  fileId: string,
  buffer: Buffer,
  extension: string
): Promise<string> {
  const userDir = path.join(UPLOADS_DIR, userId.toString());
  await mkdir(userDir, { recursive: true });
  
  const filename = `${fileId}.${extension}`;
  const filePath = path.join(userDir, filename);
  
  await writeFile(filePath, buffer);
  return filePath;
}

async function processMediaMessage(taskId: string, message: Message): Promise<void> {
  const task = await db.getTask(taskId);
  
  if (message.photo) {
    // Get largest photo
    const photo = message.photo[message.photo.length - 1];
    const file = await bot.api.getFile(photo.file_id);
    const buffer = await downloadFile(file.file_path!);
    
    if (buffer.length > MAX_FILE_SIZE) {
      console.warn('File too large, skipping');
      return;
    }
    
    const filePath = await saveFile(task.userId, task.id, buffer, 'jpg');
    
    await db.createMedia({
      id: generateUUID(),
      taskId: task.id,
      userId: task.userId,
      type: 'photo',
      filePath,
      fileSize: buffer.length,
      mimeType: 'image/jpeg',
      telegramFileId: photo.file_id
    });
  }
  
  if (message.document) {
    const doc = message.document;
    const file = await bot.api.getFile(doc.file_id);
    const buffer = await downloadFile(file.file_path!);
    
    if (buffer.length > MAX_FILE_SIZE) {
      console.warn('File too large, skipping');
      return;
    }
    
    const ext = doc.file_name?.split('.').pop() || 'bin';
    const filePath = await saveFile(task.userId, task.id, buffer, ext);
    
    await db.createMedia({
      id: generateUUID(),
      taskId: task.id,
      userId: task.userId,
      type: 'document',
      filePath,
      fileSize: buffer.length,
      mimeType: doc.mime_type,
      originalFilename: doc.file_name,
      telegramFileId: doc.file_id
    });
  }
  
  if (message.voice) {
    const voice = message.voice;
    
    // ⚠️ SECURITY: Check rate limit BEFORE downloading file!
    // This prevents DoS via large file downloads
    const recentJobs = await db.query(`
      SELECT COUNT(*) as count FROM media_queue 
      WHERE user_id = ? 
      AND created_at > ?
    `, [task.userId, Date.now() - MEDIA_QUEUE_CONFIG.RATE_LIMIT_WINDOW_MS]);
    
    if (recentJobs[0].count >= MEDIA_QUEUE_CONFIG.MAX_JOBS_PER_USER_PER_MINUTE) {
      console.warn(`[Media] Rate limited user ${task.userId} BEFORE download`);
      // Set placeholder and skip processing
      await db.updateTask(task.id, { 
        content: 'Голосовое сообщение (слишком много запросов, повторите позже)' 
      });
      return;
    }
    
    // Now safe to download
    const file = await bot.api.getFile(voice.file_id);
    const buffer = await downloadFile(file.file_path!);
    
    const filePath = await saveFile(task.userId, task.id, buffer, 'ogg');
    
    const media = await db.createMedia({
      id: generateUUID(),
      taskId: task.id,
      userId: task.userId,
      type: 'voice',
      filePath,
      fileSize: buffer.length,
      mimeType: voice.mime_type,
      telegramFileId: voice.file_id,
      transcriptionStatus: 'pending'
    });
    
    // Set placeholder content (user sees while transcription queued)
    await db.updateTask(task.id, { content: 'Голосовое сообщение' });
    
    // Enqueue transcription (rate-limited, with retries) - see section 7.2
    await enqueueTranscription(media.id, task.userId, filePath);
  }
}
```

### 7.2 Media Processing Queue

> **CRITICAL**: Queue-based processing with rate limiting, retries, and graceful fallback.
> Prevents API overload when user sends 10 voice messages in 1 minute.

#### 7.2.1 Queue Configuration

```typescript
const MEDIA_QUEUE_CONFIG = {
  // Rate limiting
  MAX_JOBS_PER_USER_PER_MINUTE: 5,
  RATE_LIMIT_WINDOW_MS: 60_000,
  
  // Retry settings
  MAX_ATTEMPTS: 3,
  RETRY_DELAYS_MS: [1000, 2000, 4000], // Exponential backoff
  
  // Processing
  POLL_INTERVAL_MS: 1000, // How often to check for pending jobs
  PROCESSING_TIMEOUT_MS: 30_000, // Max time for single transcription
  
  // Fallback text when all retries exhausted
  FALLBACK_CONTENT: 'Голосовое сообщение (не удалось расшифровать)'
};
```

#### 7.2.2 Queue Job Creation

```typescript
interface QueueJob {
  id: string;
  mediaId: string;
  userId: number;
  jobType: 'transcription' | 'link_preview';
  filePath?: string;
  url?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

async function enqueueTranscription(
  mediaId: string, 
  userId: number, 
  filePath: string
): Promise<QueueJob> {
  // Check rate limit BEFORE adding to queue
  const recentJobs = await db.query(`
    SELECT COUNT(*) as count FROM media_queue 
    WHERE user_id = ? 
    AND created_at > unixepoch() - 60
  `, [userId]);
  
  if (recentJobs[0].count >= MEDIA_QUEUE_CONFIG.MAX_JOBS_PER_USER_PER_MINUTE) {
    // Rate limited - schedule for later
    const delayMs = MEDIA_QUEUE_CONFIG.RATE_LIMIT_WINDOW_MS;
    console.warn(`Rate limited user ${userId}, scheduling job for +${delayMs}ms`);
    
    return await db.createMediaQueueJob({
      id: generateUUID(),
      mediaId,
      userId,
      jobType: 'transcription',
      filePath,
      status: 'pending',
      attempts: 0,
      maxAttempts: MEDIA_QUEUE_CONFIG.MAX_ATTEMPTS,
      nextAttemptAt: Math.floor((Date.now() + delayMs) / 1000)
    });
  }
  
  // Not rate limited - queue for immediate processing
  return await db.createMediaQueueJob({
    id: generateUUID(),
    mediaId,
    userId,
    jobType: 'transcription',
    filePath,
    status: 'pending',
    attempts: 0,
    maxAttempts: MEDIA_QUEUE_CONFIG.MAX_ATTEMPTS,
    nextAttemptAt: Math.floor(Date.now() / 1000) // Now
  });
}
```

#### 7.2.3 Queue Processor (Worker Loop)

```typescript
import OpenAI from 'openai';
import { createReadStream } from 'fs';

const openai = new OpenAI();

// Start the queue processor on server boot
let processorRunning = false;

function startMediaQueueProcessor(): void {
  if (processorRunning) return;
  processorRunning = true;
  
  console.log('🎙️ Media queue processor started');
  
  setInterval(async () => {
    await processNextJob();
  }, MEDIA_QUEUE_CONFIG.POLL_INTERVAL_MS);
}

async function processNextJob(): Promise<void> {
  // Fetch oldest pending job that's ready for processing
  const job = await db.queryOne<QueueJob>(`
    SELECT * FROM media_queue 
    WHERE status IN ('pending') 
    AND next_attempt_at <= unixepoch()
    ORDER BY next_attempt_at ASC 
    LIMIT 1
  `);
  
  if (!job) return; // No pending jobs
  
  // Mark as processing (prevent double-processing)
  await db.updateMediaQueueJob(job.id, { status: 'processing' });
  
  try {
    await processTranscriptionJob(job);
    
    // Success!
    await db.updateMediaQueueJob(job.id, { 
      status: 'completed',
      completedAt: Math.floor(Date.now() / 1000)
    });
    
    console.log(`✅ Transcription completed for media ${job.mediaId}`);
    
  } catch (error) {
    await handleJobFailure(job, error);
  }
}

async function processTranscriptionJob(job: QueueJob): Promise<void> {
  if (!job.filePath) {
    throw new Error('No file path for transcription job');
  }
  
  // Call Whisper API with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, MEDIA_QUEUE_CONFIG.PROCESSING_TIMEOUT_MS);
  
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(job.filePath),
      model: 'whisper-1',
      language: 'ru'
    });
    
    clearTimeout(timeout);
    
    // Update media record
    await db.updateMedia(job.mediaId, {
      transcription: transcription.text,
      transcriptionStatus: 'completed'
    });
    
    // Update task content (if still placeholder)
    const media = await db.getMedia(job.mediaId);
    const task = await db.getTask(media.taskId);
    
    if (task.content === 'Голосовое сообщение' || 
        task.content === MEDIA_QUEUE_CONFIG.FALLBACK_CONTENT ||
        !task.content) {
      await db.updateTask(task.id, { content: transcription.text });
      
      // Notify user that transcription is ready
      await notifyTranscriptionComplete(job.userId, task, transcription.text);
    }
    
  } finally {
    clearTimeout(timeout);
  }
}

async function notifyTranscriptionComplete(
  userId: number, 
  task: Task, 
  transcription: string
): Promise<void> {
  try {
    const preview = transcription.length > 100 
      ? transcription.slice(0, 100) + '...' 
      : transcription;
    
    await bot.api.sendMessage(userId, 
      `🎙️ Голосовое расшифровано:\n\n"${preview}"`,
      { reply_markup: { inline_keyboard: [[
        { text: '✏️ Редактировать', callback_data: `edit:${task.id}` }
      ]]}
    });
  } catch (error) {
    // User might have blocked bot - ignore silently
    if (!isBotBlockedError(error)) {
      console.error('Failed to send transcription notification:', error);
    }
  }
}
```

#### 7.2.4 Retry Logic with Exponential Backoff

```typescript
async function handleJobFailure(job: QueueJob, error: unknown): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const newAttempts = job.attempts + 1;
  
  console.error(`❌ Transcription failed for ${job.mediaId} (attempt ${newAttempts}/${job.maxAttempts}):`, errorMessage);
  
  if (newAttempts >= job.maxAttempts) {
    // All retries exhausted - apply fallback
    await applyFallback(job, errorMessage);
    return;
  }
  
  // Schedule retry with exponential backoff
  const delayMs = MEDIA_QUEUE_CONFIG.RETRY_DELAYS_MS[newAttempts - 1] || 4000;
  const nextAttemptAt = Math.floor((Date.now() + delayMs) / 1000);
  
  await db.updateMediaQueueJob(job.id, {
    status: 'pending', // Back to pending for retry
    attempts: newAttempts,
    nextAttemptAt,
    lastError: errorMessage
  });
  
  console.log(`🔄 Retry scheduled for ${job.mediaId} in ${delayMs}ms`);
}

async function applyFallback(job: QueueJob, errorMessage: string): Promise<void> {
  // Mark job as failed
  await db.updateMediaQueueJob(job.id, {
    status: 'failed',
    attempts: job.maxAttempts,
    lastError: errorMessage,
    completedAt: Math.floor(Date.now() / 1000)
  });
  
  // Update media record
  await db.updateMedia(job.mediaId, {
    transcriptionStatus: 'failed'
  });
  
  // Update task content with fallback
  const media = await db.getMedia(job.mediaId);
  const task = await db.getTask(media.taskId);
  
  if (task.content === 'Голосовое сообщение' || !task.content) {
    await db.updateTask(task.id, { 
      content: MEDIA_QUEUE_CONFIG.FALLBACK_CONTENT 
    });
  }
  
  console.warn(`⚠️ Applied fallback for media ${job.mediaId} after ${job.maxAttempts} failed attempts`);
}
```

#### 7.2.5 Updated Voice Message Handler

```typescript
// In handleMediaAttachments (section 7.1), replace transcribeVoiceAsync call:

if (message.voice) {
  const voice = message.voice;
  const file = await bot.api.getFile(voice.file_id);
  const buffer = await downloadFile(file.file_path!);
  
  const filePath = await saveFile(task.userId, task.id, buffer, 'ogg');
  
  const media = await db.createMedia({
    id: generateUUID(),
    taskId: task.id,
    userId: task.userId,
    type: 'voice',
    filePath,
    fileSize: buffer.length,
    mimeType: voice.mime_type,
    telegramFileId: voice.file_id,
    transcriptionStatus: 'pending'
  });
  
  // Set placeholder content immediately (user sees this while transcription queued)
  await db.updateTask(task.id, { content: 'Голосовое сообщение' });
  
  // Enqueue transcription (rate-limited, with retries)
  await enqueueTranscription(media.id, task.userId, filePath);
}
```

#### 7.2.6 Queue Status Monitoring

```typescript
// Utility functions for monitoring and debugging

async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTimeMs: number;
}> {
  const stats = await db.queryOne(`
    SELECT 
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(CASE WHEN completed_at IS NOT NULL 
        THEN (completed_at - created_at) * 1000 
        ELSE NULL END) as avg_processing_time_ms
    FROM media_queue
    WHERE created_at > unixepoch() - 86400
  `);
  
  return {
    pending: stats.pending || 0,
    processing: stats.processing || 0,
    completed: stats.completed || 0,
    failed: stats.failed || 0,
    avgProcessingTimeMs: Math.round(stats.avg_processing_time_ms || 0)
  };
}

// Cleanup old completed/failed jobs (run daily)
async function cleanupOldQueueJobs(): Promise<number> {
  const result = await db.run(`
    DELETE FROM media_queue 
    WHERE status IN ('completed', 'failed')
    AND completed_at < unixepoch() - 604800 -- 7 days
  `);
  
  return result.changes;
}
```

### 7.3 Link Preview (OG Tags)

> **⚠️ SSRF PROTECTION**: Must validate URLs before fetching to prevent internal network scanning.

```typescript
import { parse } from 'node-html-parser';

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_PATTERNS = [
  /^127\./,                    // Loopback
  /^10\./,                     // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./,               // Class C private
  /^169\.254\./,               // Link-local
  /^0\./,                      // Current network
  /^fc00:/i,                   // IPv6 private
  /^fe80:/i,                   // IPv6 link-local
  /^::1$/,                     // IPv6 loopback
  /^localhost$/i,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
}

async function extractLinkPreview(url: string): Promise<{
  title?: string;
  description?: string;
  imageUrl?: string;
}> {
  try {
    // ⚠️ SSRF PROTECTION: Validate URL before fetching
    const parsed = new URL(url);
    
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.warn(`[LinkPreview] Blocked non-http protocol: ${parsed.protocol}`);
      return {};
    }
    
    // Block private/internal IPs
    if (isPrivateHost(parsed.hostname)) {
      console.warn(`[LinkPreview] Blocked private IP: ${parsed.hostname}`);
      return {};
    }
    
    // Resolve hostname to check actual IP (prevent DNS rebinding)
    // In production, use a proper DNS resolver check
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LazyFlowBot/1.0' },
      timeout: 5000,
      redirect: 'manual' // Don't follow redirects to private IPs
    });
    
    // Check redirect target for SSRF
    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers.get('location');
      if (redirectUrl) {
        const redirectParsed = new URL(redirectUrl, url);
        if (isPrivateHost(redirectParsed.hostname)) {
          console.warn(`[LinkPreview] Blocked redirect to private IP: ${redirectParsed.hostname}`);
          return {};
        }
      }
    }
    
    const html = await response.text();
    const root = parse(html);
    
    const getMetaContent = (property: string) => 
      root.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ||
      root.querySelector(`meta[name="${property}"]`)?.getAttribute('content');
    
    return {
      title: getMetaContent('og:title') || root.querySelector('title')?.text,
      description: getMetaContent('og:description') || getMetaContent('description'),
      imageUrl: getMetaContent('og:image')
    };
    
  } catch (error) {
    console.error('Link preview failed:', error);
    return {};
  }
}
```

---

## 8. GOOGLE CALENDAR INTEGRATION

### 8.1 OAuth Setup

```typescript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

function generateGoogleAuthUrl(userId: number): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force refresh token
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ],
    state: userId.toString()
  });
}

async function exchangeCodeForTokens(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function getValidAccessToken(user: User): Promise<string | null> {
  if (!user.googleAccessToken) return null;
  
  // Check if token is expired (with 5 min buffer)
  if (user.googleTokenExpiry && user.googleTokenExpiry < Date.now() + 5 * 60 * 1000) {
    // Refresh token
    if (!user.googleRefreshToken) return null;
    
    try {
      oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      await db.updateUser(user.telegramId, {
        googleAccessToken: credentials.access_token,
        googleTokenExpiry: credentials.expiry_date
      });
      
      return credentials.access_token!;
      
    } catch (error) {
      // ⚠️ HIGH: Token refresh failed - could be revoked
      console.error(`[Calendar] Token refresh failed for user ${user.telegramId}:`, error);
      
      // Mark integration as broken, stop hammering API
      await db.updateUser(user.telegramId, {
        googleAccessToken: null,
        googleTokenExpiry: null
        // Keep refresh token for manual reconnection attempt
      });
      
      return null;
    }
  }
  
  return user.googleAccessToken;
}
```

### 8.2 Two-Way Sync

> **⚠️ HIGH: Calendar sync needs retry with backoff and 401 handling**

```typescript
// Telegram → Calendar (when task with deadline is created/updated)
async function syncTaskToCalendar(task: Task): Promise<void> {
  if (!task.deadline) return;
  
  const user = await db.getUser(task.userId);
  const accessToken = await getValidAccessToken(user);
  if (!accessToken) return;
  
  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const event = {
    summary: task.content.slice(0, 100),
    description: task.content,
    start: {
      dateTime: new Date(task.deadline).toISOString(),
      timeZone: user.timezone
    },
    end: {
      dateTime: new Date(task.deadline + 30 * 60 * 1000).toISOString(), // +30 min
      timeZone: user.timezone
    }
  };
  
  try {
    if (task.googleEventId) {
      // Update existing event
      await calendar.events.update({
        calendarId: user.googleCalendarId || 'primary',
        eventId: task.googleEventId,
        requestBody: event
      });
    } else {
      // Create new event
      const res = await calendar.events.insert({
        calendarId: user.googleCalendarId || 'primary',
        requestBody: event
      });
      
      await db.updateTask(task.id, { googleEventId: res.data.id });
    }
  } catch (error: any) {
    // ⚠️ Handle 401 - token expired during call
    if (error.code === 401) {
      console.warn(`[Calendar] 401 for user ${user.telegramId}, refreshing token`);
      
      // Clear cached token, try once more
      await db.updateUser(user.telegramId, { googleAccessToken: null });
      const newToken = await getValidAccessToken(user);
      
      if (newToken) {
        oauth2Client.setCredentials({ access_token: newToken });
        // Retry once
        if (task.googleEventId) {
          await calendar.events.update({
            calendarId: user.googleCalendarId || 'primary',
            eventId: task.googleEventId,
            requestBody: event
          });
        } else {
          const res = await calendar.events.insert({
            calendarId: user.googleCalendarId || 'primary',
            requestBody: event
          });
          await db.updateTask(task.id, { googleEventId: res.data.id });
        }
      }
    } else {
      // Log other errors but don't crash
      console.error(`[Calendar] Sync failed for task ${task.id}:`, error.message);
    }
  }
}

// Calendar → Telegram (polling every 5 minutes)
new Cron('*/5 * * * *', async () => {
  const usersWithCalendar = await db.query(`
    SELECT * FROM users
    WHERE google_access_token IS NOT NULL
  `);
  
  for (const user of usersWithCalendar) {
    await syncCalendarToTasks(user);
  }
});

async function syncCalendarToTasks(user: User): Promise<void> {
  const accessToken = await getValidAccessToken(user);
  if (!accessToken) return;
  
  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  // Get recent events
  const now = new Date();
  const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const res = await calendar.events.list({
    calendarId: user.googleCalendarId || 'primary',
    timeMin: now.toISOString(),
    timeMax: oneWeekAhead.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });
  
  for (const event of res.data.items || []) {
    // Check if we already have this event
    const existingTask = await db.query(`
      SELECT * FROM tasks
      WHERE user_id = ? AND google_event_id = ?
    `, [user.telegramId, event.id]);
    
    if (existingTask.length === 0) {
      // Create new task from calendar event
      await createTask({
        userId: user.telegramId,
        content: event.summary || 'Calendar event',
        folder: 'work', // Assume calendar events are work-related
        status: 'active',
        deadline: new Date(event.start?.dateTime || event.start?.date!).getTime(),
        googleEventId: event.id,
        source: 'calendar'
      });
    } else {
      // Check for updates (Telegram is source of truth for conflicts)
      const task = existingTask[0];
      const eventUpdated = new Date(event.updated!).getTime();
      const taskUpdated = task.updatedAt;
      
      // Only update if calendar is newer AND task wasn't edited in Telegram
      if (eventUpdated > taskUpdated && task.source === 'calendar') {
        await db.updateTask(task.id, {
          content: event.summary || task.content,
          deadline: new Date(event.start?.dateTime || event.start?.date!).getTime()
        });
      }
    }
  }
}
```

---

## 9. TESTING

### 9.1 Test Setup (Vitest)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});

// tests/setup.ts
import { Database } from 'bun:sqlite';

// Use in-memory SQLite for tests
globalThis.testDb = new Database(':memory:');

beforeEach(async () => {
  // Reset database state
  await runMigrations(globalThis.testDb);
});

afterEach(async () => {
  // Cleanup
  globalThis.testDb.run('DELETE FROM tasks');
  globalThis.testDb.run('DELETE FROM users');
});
```

### 9.2 Unit Tests

```typescript
// tests/classification.test.ts
import { describe, it, expect, vi } from 'vitest';
import { processMessage, determineType, determineFolder } from '../src/bot/capture';

describe('Message Processing', () => {
  describe('Tag Detection', () => {
    it('should detect #w tag as work folder', async () => {
      const message = { text: '#w Complete quarterly report' };
      const result = await processMessage(message as any);
      
      expect(result.folder).toBe('work');
      expect(result.content).toBe('Complete quarterly report');
      expect(result.needsAiClassification).toBe(false);
    });
    
    it('should detect #p tag as personal folder', async () => {
      const message = { text: '#p Buy groceries' };
      const result = await processMessage(message as any);
      
      expect(result.folder).toBe('personal');
    });
    
    it('should detect #i tag as ideas folder', async () => {
      const message = { text: '#i Start a podcast' };
      const result = await processMessage(message as any);
      
      expect(result.folder).toBe('ideas');
    });
  });
  
  describe('Type Detection', () => {
    it('should classify short content as task', () => {
      const content = 'Buy milk';
      expect(determineType(content)).toBe('task');
    });
    
    it('should classify long content (>500 chars) as note', () => {
      const content = 'A'.repeat(501);
      expect(determineType(content)).toBe('note');
    });
  });
  
  describe('URL Detection', () => {
    it('should detect URLs and assign to media folder', async () => {
      const message = { text: 'Check out https://example.com/article' };
      const result = await processMessage(message as any);
      
      expect(result.folder).toBe('media');
      expect(result.mediaType).toBe('link');
    });
  });
});

describe('AI Classification', () => {
  it('should fallback to personal folder when AI fails', async () => {
    vi.mock('../src/ai/classifier', () => ({
      openaiClassifier: {
        classify: vi.fn().mockRejectedValue(new Error('API Error'))
      },
      geminiClassifier: {
        classify: vi.fn().mockRejectedValue(new Error('API Error'))
      }
    }));
    
    const message = { text: 'Random task without tags' };
    const result = await processMessage(message as any);
    
    expect(result.folder).toBe('personal');
  });
});
```

### 9.3 Integration Tests

```typescript
// tests/api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../src/app';

describe('API Integration', () => {
  const validInitData = generateTestInitData({ id: 123456789, first_name: 'Test' });
  
  beforeAll(async () => {
    // Create test user
    await testDb.run(`
      INSERT INTO users (telegram_id, username, first_name)
      VALUES (123456789, 'testuser', 'Test')
    `);
  });
  
  describe('GET /api/tasks', () => {
    it('should return 401 without auth', async () => {
      const res = await app.request('/api/tasks');
      expect(res.status).toBe(401);
    });
    
    it('should return empty array for new user', async () => {
      const res = await app.request('/api/tasks', {
        headers: { 'X-Telegram-Init-Data': validInitData }
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });
    
    it('should return tasks for authenticated user', async () => {
      // Create test task
      await testDb.run(`
        INSERT INTO tasks (id, user_id, content, status, folder)
        VALUES ('test-id', 123456789, 'Test task', 'active', 'work')
      `);
      
      const res = await app.request('/api/tasks', {
        headers: { 'X-Telegram-Init-Data': validInitData }
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].content).toBe('Test task');
    });
  });
  
  describe('POST /api/tasks', () => {
    it('should create task with valid data', async () => {
      const res = await app.request('/api/tasks', {
        method: 'POST',
        headers: {
          'X-Telegram-Init-Data': validInitData,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'New task' })
      });
      
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.content).toBe('New task');
      expect(data.status).toBe('active');
    });
    
    it('should reject content over 10000 chars', async () => {
      const res = await app.request('/api/tasks', {
        method: 'POST',
        headers: {
          'X-Telegram-Init-Data': validInitData,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'A'.repeat(10001) })
      });
      
      expect(res.status).toBe(400);
    });
  });
});

// tests/mixer.test.ts
describe('Mixer Engine', () => {
  it('should resurface tasks not seen in 14 days', async () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    
    await testDb.run(`
      INSERT INTO tasks (id, user_id, content, status, folder, last_seen_at, is_idea)
      VALUES ('old-task', 123456789, 'Old task', 'backlog', 'work', ?, 0)
    `, [fifteenDaysAgo]);
    
    const resurfaced = await runMixer(123456789);
    
    expect(resurfaced).toHaveLength(1);
    expect(resurfaced[0].id).toBe('old-task');
    
    // Verify status changed to inbox
    const task = testDb.query('SELECT status FROM tasks WHERE id = ?').get('old-task');
    expect(task.status).toBe('inbox');
  });
  
  it('should not resurface ideas', async () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    
    await testDb.run(`
      INSERT INTO tasks (id, user_id, content, status, folder, last_seen_at, is_idea)
      VALUES ('idea-task', 123456789, 'Some idea', 'backlog', 'ideas', ?, 1)
    `, [fifteenDaysAgo]);
    
    const resurfaced = await runMixer(123456789);
    
    expect(resurfaced).toHaveLength(0);
  });
  
  it('should limit to 3 tasks per session', async () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    
    // Create 5 old tasks
    for (let i = 0; i < 5; i++) {
      await testDb.run(`
        INSERT INTO tasks (id, user_id, content, status, folder, last_seen_at, is_idea)
        VALUES (?, 123456789, 'Task ${i}', 'backlog', 'work', ?, 0)
      `, [`task-${i}`, fifteenDaysAgo]);
    }
    
    const resurfaced = await runMixer(123456789);
    
    expect(resurfaced).toHaveLength(3);
  });
});
```

---

## 10. SECURITY CHECKLIST

### 10.1 Authentication
- [x] Validate initData HMAC-SHA256 on every request
- [x] Check auth_date freshness (max 24 hours)
- [x] Never trust client-side user data without verification

### 10.2 Database
- [x] Use parameterized queries (prevent SQL injection)
- [x] Set busy_timeout to prevent SQLITE_BUSY hangs
- [x] Enable foreign key constraints

### 10.3 Files
- [x] Validate file size (max 20MB)
- [x] Store files outside webroot
- [x] Sanitize filenames (use UUIDs)

### 10.4 API
- [x] Rate limiting per user (100 req/min)
- [x] Input validation on all endpoints
- [x] Never expose internal errors to clients

### 10.5 Secrets
- [x] Store BOT_TOKEN in environment variables
- [x] Encrypt OAuth tokens at rest (consider)
- [x] Use random webhook secret path

---

## 11. DEPLOYMENT

### 11.1 Dockerfile

```dockerfile
FROM oven/bun:1.0

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

# Create uploads directory
RUN mkdir -p uploads data

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/lazyflow.db

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
```

### 11.2 Environment Variables

```bash
# Required
BOT_TOKEN=your_telegram_bot_token
WEBHOOK_SECRET=random_secure_string

# Optional (AI)
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Google Calendar
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-domain.com/api/calendar/callback

# Database
DATABASE_PATH=./data/lazyflow.db
```

### 11.3 Coolify Configuration

```yaml
# docker-compose.yml (for Coolify)
services:
  lazyflow:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/lazyflow.db
    restart: unless-stopped
```

---

## 12. IMPLEMENTATION CHECKLIST

### Phase 1: Core
- [ ] Project setup (Bun + Hono + TypeScript)
- [ ] Database schema migrations
- [ ] Telegram Bot with message capture
- [ ] Tag-based folder assignment
- [ ] REST API (CRUD endpoints)
- [ ] Telegram initData authentication

### Phase 2: Entity Types
- [ ] Task creation (status='inbox')
- [ ] Note creation (status='active', folder='notes', bypass inbox)
- [ ] Type auto-detection (>500 chars = note)
- [ ] DONE status handling (completedAt timestamp)
- [ ] Restore from done/archived

### Phase 3: AI & Media
- [ ] AI classification (OpenAI + Gemini fallback)
- [ ] File upload handling
- [ ] Media processing queue (rate limiting, retries)
- [ ] Voice transcription (Whisper via queue)
- [ ] Transcription failure fallback ("Голосовое сообщение")
- [ ] Link preview extraction

### Phase 4: Engines
- [ ] Mixer engine (on app open, includes notes)
- [ ] Sunset engine (30 days active → archived)
- [ ] Done auto-archive (7 days done → archived)
- [ ] Morning digest notifications
- [ ] Deadline reminders

### Phase 5: Calendar
- [ ] Google OAuth flow
- [ ] Task → Calendar sync
- [ ] Calendar → Task sync
- [ ] Token refresh handling

### Phase 6: Polish
- [ ] Error handling & logging
- [ ] Rate limiting
- [ ] Integration tests
- [ ] Documentation

---

## APPENDIX: Status Transition Matrix

| From \ To | inbox | active | backlog | done | archived | deleted |
|-----------|-------|--------|---------|------|----------|---------|
| inbox | - | ✓ (swipe right) | ✓ (swipe left) | - | - | ✓ (swipe down) |
| active | - | - | ✓ (move to later) | ✓ (complete) | ✓ (Sunset 30d) | ✓ (delete) |
| backlog | ✓ (Mixer) | ✓ (plan) | - | - | - | ✓ (delete) |
| done | - | ✓ (restore) | - | - | ✓ (auto 7d) | ✓ (delete) |
| archived | - | ✓ (restore) | ✓ (restore) | - | - | ✓ (delete) |
| deleted | - | - | - | - | - | - (permanent after 90d) |

## APPENDIX: Entity Type Comparison

| Aspect | Task | Note |
|--------|------|------|
| **Content Length** | ≤500 chars | >500 chars |
| **Initial Status** | `inbox` | `active` (bypasses inbox) |
| **Initial Folder** | AI-classified or tagged | `notes` (always) |
| **Deadline Support** | ✅ Yes | ❌ No |
| **Completion** | Required (main purpose) | Optional (long-press to show checkbox) |
| **AI Classification** | ✅ Yes (work/personal/ideas) | ❌ No (always notes folder) |
| **Sunset Engine** | ✅ 30 days → archived | ❌ **Excluded** (reference material) |
| **Mixer Engine** | ✅ Resurfaces from backlog | ✅ Resurfaces from backlog |
| **Display in Mini App** | TaskRow component | NoteCard component |
| **Checkmark UI** | Always visible | Hidden, revealed on long-press |

---

*Generated by Prometheus Planner*
*Version: 1.0*
*Date: 2026-02-04*
