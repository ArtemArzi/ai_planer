import { db, generateId } from './index';
import type { TaskDTO, TaskRow, Folder, TaskStatus, TaskType, TaskSource } from '../lib/types';

function rowToDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    type: row.type,
    status: row.status,
    folder: row.folder,
    isIdea: row.is_idea === 1,
    isMixerResurfaced: row.is_mixer_resurfaced === 1,
    deadline: row.deadline,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    googleEventId: row.google_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastInteractionAt: row.last_interaction_at,
    lastSeenAt: row.last_seen_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
    source: row.source,
    telegramMessageId: row.telegram_message_id,
    deadlineNotified: row.deadline_notified === 1
  };
}

export function createTask(data: {
  userId: number;
  content: string;
  type?: TaskType;
  status?: TaskStatus;
  folder?: Folder;
  source?: TaskSource;
  telegramMessageId?: number | null;
  deadline?: number | null;
}): TaskDTO {
  const id = generateId();
  const now = Date.now();
  const isIdea = data.folder === 'ideas' ? 1 : 0;
  
  db.run(`
    INSERT INTO tasks (
      id, user_id, content, type, status, folder, is_idea, 
      source, telegram_message_id, deadline, 
      created_at, updated_at, last_interaction_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.userId,
    data.content,
    data.type || 'task',
    data.status || 'inbox',
    data.folder || 'personal',
    isIdea,
    data.source || 'bot',
    data.telegramMessageId || null,
    data.deadline || null,
    now,
    now,
    now
  ]);
  
  return getTask(id)!;
}

export function getTask(id: string): TaskDTO | null {
  const row = db.query<TaskRow, [string]>(
    'SELECT * FROM tasks WHERE id = ?'
  ).get(id);
  
  return row ? rowToDTO(row) : null;
}

export interface GetTasksFilter {
  userId: number;
  status?: TaskStatus;
  folder?: Folder;
  cursor?: string;
  limit?: number;
}

export function getTasks(filter: GetTasksFilter): TaskDTO[] {
  const conditions: string[] = ['user_id = ?'];
  const params: (string | number)[] = [filter.userId];
  
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  
  if (filter.folder) {
    conditions.push('folder = ?');
    params.push(filter.folder);
  }
  
  if (filter.cursor) {
    conditions.push('id < ?');
    params.push(filter.cursor);
  }
  
  const limit = filter.limit || 50;
  params.push(limit);
  
  const sql = `
    SELECT * FROM tasks 
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;
  
  const rows = db.query<TaskRow, (string | number)[]>(sql).all(...params);
  return rows.map(rowToDTO);
}

export function updateTask(
  id: string,
  updates: Partial<{
    content: string;
    type: TaskType;
    status: TaskStatus;
    folder: Folder;
    isIdea: boolean;
    isMixerResurfaced: boolean;
    deadline: number | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    googleEventId: string | null;
    lastInteractionAt: number;
    lastSeenAt: number | null;
    completedAt: number | null;
    deletedAt: number | null;
    deadlineNotified: boolean;
  }>
): TaskDTO | null {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.folder !== undefined) {
    fields.push('folder = ?');
    values.push(updates.folder);
    fields.push('is_idea = ?');
    values.push(updates.folder === 'ideas' ? 1 : 0);
  }
  if (updates.isMixerResurfaced !== undefined) {
    fields.push('is_mixer_resurfaced = ?');
    values.push(updates.isMixerResurfaced ? 1 : 0);
  }
  if (updates.deadline !== undefined) {
    fields.push('deadline = ?');
    values.push(updates.deadline);
  }
  if (updates.scheduledDate !== undefined) {
    fields.push('scheduled_date = ?');
    values.push(updates.scheduledDate);
  }
  if (updates.scheduledTime !== undefined) {
    fields.push('scheduled_time = ?');
    values.push(updates.scheduledTime);
  }
  if (updates.googleEventId !== undefined) {
    fields.push('google_event_id = ?');
    values.push(updates.googleEventId);
  }
  if (updates.lastInteractionAt !== undefined) {
    fields.push('last_interaction_at = ?');
    values.push(updates.lastInteractionAt);
  }
  if (updates.lastSeenAt !== undefined) {
    fields.push('last_seen_at = ?');
    values.push(updates.lastSeenAt);
  }
  if (updates.completedAt !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completedAt);
  }
  if (updates.deletedAt !== undefined) {
    fields.push('deleted_at = ?');
    values.push(updates.deletedAt);
  }
  if (updates.deadlineNotified !== undefined) {
    fields.push('deadline_notified = ?');
    values.push(updates.deadlineNotified ? 1 : 0);
  }
  
  if (fields.length === 0) return getTask(id);
  
  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  
  db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  
  return getTask(id);
}

export function findTaskByTelegramMessageId(
  userId: number,
  telegramMessageId: number
): TaskDTO | null {
  const row = db.query<TaskRow, [number, number]>(`
    SELECT * FROM tasks 
    WHERE user_id = ? AND telegram_message_id = ?
  `).get(userId, telegramMessageId);
  
  return row ? rowToDTO(row) : null;
}

export function countTasks(userId: number, status?: TaskStatus): number {
  if (status) {
    const result = db.query<{ count: number }, [number, string]>(
      'SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = ?'
    ).get(userId, status);
    return result?.count || 0;
  }
  
  const result = db.query<{ count: number }, [number]>(
    'SELECT COUNT(*) as count FROM tasks WHERE user_id = ?'
  ).get(userId);
  return result?.count || 0;
}

export function deleteTask(id: string): boolean {
  const result = db.run('DELETE FROM tasks WHERE id = ?', [id]);
  return result.changes > 0;
}
