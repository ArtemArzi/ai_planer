import { db, generateId } from './index';
import type { UserDTO, UserRow } from '../lib/types';

function rowToDTO(row: UserRow): UserDTO {
  return {
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    timezone: row.timezone,
    notificationsEnabled: row.notifications_enabled === 1,
    morningDigestTime: row.morning_digest_time,
    deadlineReminderMinutes: row.deadline_reminder_minutes,
    storiesNotifications: row.stories_notifications === 1,
    aiClassificationEnabled: row.ai_classification_enabled === 1,
    hasGoogleCalendar: !!row.google_refresh_token,
    createdAt: row.created_at
  };
}

export function getUser(telegramId: number): UserDTO | null {
  const row = db.query<UserRow, [number]>(
    'SELECT * FROM users WHERE telegram_id = ?'
  ).get(telegramId);
  
  return row ? rowToDTO(row) : null;
}

export function upsertUser(data: {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string;
}): UserDTO {
  const now = Date.now();
  
  db.run(`
    INSERT INTO users (telegram_id, username, first_name, last_name, language_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = ?
  `, [
    data.telegramId,
    data.username || null,
    data.firstName || null,
    data.lastName || null,
    data.languageCode || 'ru',
    now,
    now,
    now
  ]);
  
  return getUser(data.telegramId)!;
}

export function updateUser(
  telegramId: number,
  updates: Partial<{
    timezone: string;
    notificationsEnabled: boolean;
    morningDigestTime: string;
    deadlineReminderMinutes: number;
    storiesNotifications: boolean;
    aiClassificationEnabled: boolean;
    lastMixerRun: number;
  }>
): UserDTO | null {
  const fields: string[] = [];
  const values: (string | number)[] = [];
  
  if (updates.timezone !== undefined) {
    fields.push('timezone = ?');
    values.push(updates.timezone);
  }
  if (updates.notificationsEnabled !== undefined) {
    fields.push('notifications_enabled = ?');
    values.push(updates.notificationsEnabled ? 1 : 0);
  }
  if (updates.morningDigestTime !== undefined) {
    fields.push('morning_digest_time = ?');
    values.push(updates.morningDigestTime);
  }
  if (updates.deadlineReminderMinutes !== undefined) {
    fields.push('deadline_reminder_minutes = ?');
    values.push(updates.deadlineReminderMinutes);
  }
  if (updates.storiesNotifications !== undefined) {
    fields.push('stories_notifications = ?');
    values.push(updates.storiesNotifications ? 1 : 0);
  }
  if (updates.aiClassificationEnabled !== undefined) {
    fields.push('ai_classification_enabled = ?');
    values.push(updates.aiClassificationEnabled ? 1 : 0);
  }
  if (updates.lastMixerRun !== undefined) {
    fields.push('last_mixer_run = ?');
    values.push(updates.lastMixerRun);
  }
  
  if (fields.length === 0) return getUser(telegramId);
  
  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(telegramId);
  
  db.run(`UPDATE users SET ${fields.join(', ')} WHERE telegram_id = ?`, values);
  
  return getUser(telegramId);
}

export function deleteUser(telegramId: number): boolean {
  const result = db.run('DELETE FROM users WHERE telegram_id = ?', [telegramId]);
  return result.changes > 0;
}

export function getUsersForDigest(currentHour: number, currentMinute: number): UserDTO[] {
  const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  
  const rows = db.query<UserRow, [string]>(`
    SELECT * FROM users 
    WHERE notifications_enabled = 1 
      AND morning_digest_time = ?
  `).all(timeStr);
  
  return rows.map(rowToDTO);
}
