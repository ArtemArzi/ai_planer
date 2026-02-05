-- LAZY FLOW Database Schema
-- ALL timestamps are in MILLISECONDS (JavaScript Date.now() format)

-- Enable WAL mode for concurrent reads
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;

-- ===== USERS TABLE =====
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT DEFAULT 'ru',
  timezone TEXT DEFAULT 'Europe/Moscow',
  
  -- Notification Settings
  notifications_enabled INTEGER DEFAULT 1,
  morning_digest_time TEXT DEFAULT '09:00',
  deadline_reminder_minutes INTEGER DEFAULT 60,
  stories_notifications INTEGER DEFAULT 1,
  
  -- Google Calendar Integration
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry INTEGER,
  google_calendar_id TEXT,
  
  -- AI Settings
  ai_classification_enabled INTEGER DEFAULT 1,
  
  -- Metadata
  last_mixer_run INTEGER,
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  updated_at INTEGER DEFAULT (unixepoch() * 1000)
);

-- ===== TASKS TABLE =====
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  
  -- Content
  content TEXT NOT NULL,
  type TEXT CHECK(type IN ('task', 'note')) DEFAULT 'task',
  
  -- Lifecycle
  status TEXT CHECK(status IN ('inbox', 'active', 'backlog', 'done', 'archived', 'deleted')) DEFAULT 'inbox',
  folder TEXT CHECK(folder IN ('work', 'personal', 'ideas', 'media', 'notes')) DEFAULT 'personal',
  
  -- Flags
  is_idea INTEGER DEFAULT 0,
  is_mixer_resurfaced INTEGER DEFAULT 0,
  
  -- Scheduling
  deadline INTEGER,
  scheduled_date TEXT,
  scheduled_time TEXT,
  
  -- Google Calendar Sync
  google_event_id TEXT,
  
  -- Timestamps (ALL in milliseconds!)
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  updated_at INTEGER DEFAULT (unixepoch() * 1000),
  last_interaction_at INTEGER DEFAULT (unixepoch() * 1000),
  last_seen_at INTEGER,
  completed_at INTEGER,
  deleted_at INTEGER,
  
  -- Notification tracking
  deadline_notified INTEGER DEFAULT 0,
  
  -- Source tracking
  source TEXT CHECK(source IN ('bot', 'miniapp', 'calendar')) DEFAULT 'bot',
  telegram_message_id INTEGER
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_folder ON tasks(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_mixer ON tasks(user_id, status, last_seen_at) WHERE status = 'backlog';
CREATE INDEX IF NOT EXISTS idx_tasks_sunset ON tasks(status, last_interaction_at) WHERE status = 'active';

-- CRITICAL: Idempotency for Telegram webhooks
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_telegram_idempotency 
  ON tasks(user_id, telegram_message_id) 
  WHERE telegram_message_id IS NOT NULL;

-- ===== MEDIA TABLE =====
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  
  -- File info
  type TEXT CHECK(type IN ('photo', 'document', 'voice', 'link')) NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  original_filename TEXT,
  
  -- Telegram file reference
  telegram_file_id TEXT,
  
  -- Link preview (OG tags)
  url TEXT,
  link_title TEXT,
  link_description TEXT,
  link_image_url TEXT,
  
  -- Voice transcription
  transcription TEXT,
  transcription_status TEXT CHECK(transcription_status IN ('pending', 'completed', 'failed')),
  
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_media_task ON media(task_id);

-- ===== MEDIA QUEUE TABLE =====
CREATE TABLE IF NOT EXISTS media_queue (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  
  -- Job info
  job_type TEXT CHECK(job_type IN ('transcription', 'link_preview')) NOT NULL,
  file_path TEXT,
  url TEXT,
  
  -- Status tracking
  status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Timing (ALL in milliseconds!)
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  next_attempt_at INTEGER DEFAULT (unixepoch() * 1000),
  completed_at INTEGER,
  
  -- Error tracking
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_queue_pending ON media_queue(status, next_attempt_at) 
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_media_queue_user ON media_queue(user_id, created_at);

-- ===== SUNSET NOTIFICATIONS TABLE =====
-- Stores notification counts for ghost trail toast
CREATE TABLE IF NOT EXISTS sunset_notifications (
  user_id INTEGER PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
  archived_count INTEGER DEFAULT 0,
  last_archived_at INTEGER,
  shown INTEGER DEFAULT 0
);
