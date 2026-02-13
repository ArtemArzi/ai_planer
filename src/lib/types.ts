// LAZY FLOW - Shared Type Definitions
// ALL timestamps are in MILLISECONDS (JavaScript Date.now() format)

// ===== FOLDER TYPES =====
export const SYSTEM_FOLDER_SLUGS = ['work', 'personal', 'ideas', 'media', 'notes'] as const;
export type SystemFolderSlug = typeof SYSTEM_FOLDER_SLUGS[number];
export type FolderSlug = string;
/** @deprecated Use FolderSlug */
export type Folder = FolderSlug;

// ===== CORE ENUMS =====
export type TaskStatus = 'inbox' | 'active' | 'backlog' | 'done' | 'archived' | 'deleted';
export type TaskType = 'task' | 'note';
export type TaskSource = 'bot' | 'miniapp' | 'calendar';
export type RecurrenceRule = 'daily' | 'weekdays' | 'weekly';
export type MediaType = 'photo' | 'document' | 'voice' | 'link';
export type TranscriptionStatus = 'pending' | 'completed' | 'failed';
export type QueueJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type QueueJobType = 'transcription' | 'link_preview';

// ===== TASK DTO =====
// This is what the API returns (camelCase)
export interface TaskDTO {
  id: string;
  userId: number;
  content: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  folder: FolderSlug;
  isIdea: boolean;
  isMixerResurfaced: boolean;
  deadline: number | null;           // ms timestamp
  scheduledDate: string | null;      // YYYY-MM-DD
  scheduledTime: string | null;      // HH:MM
  recurrenceRule: RecurrenceRule | null;
  googleEventId: string | null;
  createdAt: number;                 // ms
  updatedAt: number;                 // ms
  lastInteractionAt: number;         // ms
  lastSeenAt: number | null;         // ms
  completedAt: number | null;        // ms
  deletedAt: number | null;          // ms
  source: TaskSource;
  telegramMessageId: number | null;
  deadlineNotified: boolean;         // For deadline reminder idempotency
}

// ===== USER DTO =====
// This is what the API returns (camelCase, NO tokens!)
export interface UserDTO {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  timezone: string;
  notificationsEnabled: boolean;     // NOT number!
  morningDigestTime: string;         // HH:MM format
  deadlineReminderMinutes: number;
  storiesNotifications: boolean;     // NOT number!
  aiClassificationEnabled: boolean;  // NOT number!
  hasGoogleCalendar: boolean;        // Derived boolean, NOT raw token!
  createdAt: number;                 // ms
}

// ===== MEDIA DTO =====
export interface MediaDTO {
  id: string;
  taskId: string;
  userId: number;
  type: MediaType;
  filePath: string | null;
  fileSize: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  telegramFileId: string | null;
  url: string | null;                // For link type
  linkTitle: string | null;
  linkDescription: string | null;
  linkImageUrl: string | null;
  transcription: string | null;
  transcriptionStatus: TranscriptionStatus | null;
  createdAt: number;                 // ms
}

// ===== DATABASE ROW TYPES =====
// These are what SQLite returns (snake_case)
export interface TaskRow {
  id: string;
  user_id: number;
  content: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  folder: FolderSlug;
  is_idea: number;
  is_mixer_resurfaced: number;
  deadline: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  recurrence_rule: RecurrenceRule | null;
  google_event_id: string | null;
  created_at: number;
  updated_at: number;
  last_interaction_at: number;
  last_seen_at: number | null;
  completed_at: number | null;
  deleted_at: number | null;
  source: TaskSource;
  telegram_message_id: number | null;
  deadline_notified: number;
}

export interface UserRow {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string;
  timezone: string;
  notifications_enabled: number;
  morning_digest_time: string;
  deadline_reminder_minutes: number;
  stories_notifications: number;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: number | null;
  google_calendar_id: string | null;
  ai_classification_enabled: number;
  last_mixer_run: number | null;
  created_at: number;
  updated_at: number;
}

export interface MediaRow {
  id: string;
  task_id: string;
  user_id: number;
  type: MediaType;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  original_filename: string | null;
  telegram_file_id: string | null;
  url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image_url: string | null;
  transcription: string | null;
  transcription_status: TranscriptionStatus | null;
  created_at: number;
}

export interface MediaQueueRow {
  id: string;
  media_id: string;
  user_id: number;
  job_type: QueueJobType;
  file_path: string | null;
  url: string | null;
  status: QueueJobStatus;
  attempts: number;
  max_attempts: number;
  created_at: number;
  next_attempt_at: number;
  completed_at: number | null;
  last_error: string | null;
}

// ===== FOLDER ROW / DTO =====
export interface FolderRow {
  id: string;
  user_id: number;
  slug: string;
  display_name: string;
  is_system: number;
  icon: string;
  color: string;
  position: number;
  created_at: number;
  updated_at: number;
}

export interface FolderDTO {
  id: string;
  userId: number;
  slug: string;
  displayName: string;
  isSystem: boolean;
  icon: string;
  color: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

// ===== API TYPES =====
export interface APIError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

// ===== DATE PARSING TYPES =====
export interface DateParseResult {
  scheduledDate: string | null;       // YYYY-MM-DD
  scheduledTime: string | null;       // HH:mm
  deadline: number | null;            // ms timestamp (if both date+time present)
  recurrenceRule: RecurrenceRule | null;
  strippedContent: string;            // Text with date phrases removed
  confidence: 'high' | 'medium' | 'low' | 'none';
}

// ===== CAPTURE TYPES =====
export interface CaptureResult {
  content: string;
  folder: FolderSlug;
  type: TaskType;
  status: TaskStatus;
  mediaType?: MediaType;
  needsAiClassification: boolean;
  hasExplicitTag: boolean;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deadline?: number | null;
  recurrenceRule?: RecurrenceRule | null;
}

export interface AIClassificationResult {
  folder: FolderSlug;
  confidence: number;
}

// ===== UNDO TYPES (Frontend) =====
export interface UndoAction {
  taskId: string;
  type: 'complete' | 'delete' | 'move';
  previousState: Partial<TaskDTO>;
  timerId: number;
  createdAt: number;
}
