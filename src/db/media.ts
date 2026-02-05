import { db, generateId } from './index';
import type { MediaDTO, MediaRow, MediaType, TranscriptionStatus } from '../lib/types';

function rowToDTO(row: MediaRow): MediaDTO {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    type: row.type,
    filePath: row.file_path,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    telegramFileId: row.telegram_file_id,
    url: row.url,
    linkTitle: row.link_title,
    linkDescription: row.link_description,
    linkImageUrl: row.link_image_url,
    transcription: row.transcription,
    transcriptionStatus: row.transcription_status,
    createdAt: row.created_at
  };
}

export function createMedia(data: {
  taskId: string;
  userId: number;
  type: MediaType;
  filePath?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  originalFilename?: string | null;
  telegramFileId?: string | null;
  url?: string | null;
  transcriptionStatus?: TranscriptionStatus | null;
}): MediaDTO {
  const id = generateId();
  const now = Date.now();
  
  db.run(`
    INSERT INTO media (
      id, task_id, user_id, type, file_path, file_size, 
      mime_type, original_filename, telegram_file_id, url,
      transcription_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.taskId,
    data.userId,
    data.type,
    data.filePath || null,
    data.fileSize || null,
    data.mimeType || null,
    data.originalFilename || null,
    data.telegramFileId || null,
    data.url || null,
    data.transcriptionStatus || null,
    now
  ]);
  
  return getMedia(id)!;
}

export function getMedia(id: string): MediaDTO | null {
  const row = db.query<MediaRow, [string]>(
    'SELECT * FROM media WHERE id = ?'
  ).get(id);
  
  return row ? rowToDTO(row) : null;
}

export function getMediaForTask(taskId: string): MediaDTO[] {
  const rows = db.query<MediaRow, [string]>(
    'SELECT * FROM media WHERE task_id = ? ORDER BY created_at ASC'
  ).all(taskId);
  
  return rows.map(rowToDTO);
}

export function updateMedia(
  id: string,
  updates: Partial<{
    filePath: string | null;
    transcription: string | null;
    transcriptionStatus: TranscriptionStatus | null;
    linkTitle: string | null;
    linkDescription: string | null;
    linkImageUrl: string | null;
  }>
): MediaDTO | null {
  const fields: string[] = [];
  const values: (string | null)[] = [];
  
  if (updates.filePath !== undefined) {
    fields.push('file_path = ?');
    values.push(updates.filePath);
  }
  if (updates.transcription !== undefined) {
    fields.push('transcription = ?');
    values.push(updates.transcription);
  }
  if (updates.transcriptionStatus !== undefined) {
    fields.push('transcription_status = ?');
    values.push(updates.transcriptionStatus);
  }
  if (updates.linkTitle !== undefined) {
    fields.push('link_title = ?');
    values.push(updates.linkTitle);
  }
  if (updates.linkDescription !== undefined) {
    fields.push('link_description = ?');
    values.push(updates.linkDescription);
  }
  if (updates.linkImageUrl !== undefined) {
    fields.push('link_image_url = ?');
    values.push(updates.linkImageUrl);
  }
  
  if (fields.length === 0) return getMedia(id);
  
  values.push(id);
  
  db.run(`UPDATE media SET ${fields.join(', ')} WHERE id = ?`, values);
  
  return getMedia(id);
}

export function deleteMediaForTask(taskId: string): number {
  const result = db.run('DELETE FROM media WHERE task_id = ?', [taskId]);
  return result.changes;
}
