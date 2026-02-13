import type { Message } from 'grammy/types';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { bot } from '../index';
import { createMedia } from '../../db/media';
import { updateTask, getTask } from '../../db/tasks';
import { db, generateId } from '../../db/index';
import { env } from '../../env';
import type { MediaType } from '../../lib/types';

const UPLOADS_DIR = './uploads';
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const MEDIA_QUEUE_CONFIG = {
  MAX_JOBS_PER_USER_PER_MINUTE: 5,
  RATE_LIMIT_WINDOW_MS: 60_000,
};

async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  
  return Buffer.from(await response.arrayBuffer());
}

async function saveFile(
  userId: number,
  buffer: Buffer,
  extension: string
): Promise<string> {
  const userDir = path.join(UPLOADS_DIR, userId.toString());
  await mkdir(userDir, { recursive: true });
  
  const fileId = generateId();
  const filename = `${fileId}.${extension}`;
  const filePath = path.join(userDir, filename);
  
  await writeFile(filePath, buffer);
  return filePath;
}

export async function processMediaMessage(
  taskId: string,
  message: Message
): Promise<void> {
  const task = getTask(taskId);
  if (!task) return;

  if (message.photo) {
    await processPhoto(taskId, task.userId, message);
  }

  if (message.document) {
    await processDocument(taskId, task.userId, message);
  }

  if (message.voice) {
    await processVoice(taskId, task.userId, message);
  }
}

async function processPhoto(
  taskId: string, 
  userId: number, 
  message: Message
): Promise<void> {
  if (!message.photo) return;

  const photo = message.photo[message.photo.length - 1];
  const file = await bot.api.getFile(photo.file_id);
  
  if (!file.file_path) {
    console.error('[Media] No file_path in photo');
    return;
  }

  const buffer = await downloadTelegramFile(file.file_path);
  
  if (buffer.length > MAX_FILE_SIZE) {
    console.warn('[Media] Photo too large, skipping');
    return;
  }

  const filePath = await saveFile(userId, buffer, 'jpg');

  createMedia({
    taskId,
    userId,
    type: 'photo',
    filePath,
    fileSize: buffer.length,
    mimeType: 'image/jpeg',
    telegramFileId: photo.file_id
  });

  console.log(`[Media] Photo saved: ${filePath}`);
}

async function processDocument(
  taskId: string, 
  userId: number, 
  message: Message
): Promise<void> {
  if (!message.document) return;

  const doc = message.document;
  const file = await bot.api.getFile(doc.file_id);
  
  if (!file.file_path) {
    console.error('[Media] No file_path in document');
    return;
  }

  const buffer = await downloadTelegramFile(file.file_path);
  
  if (buffer.length > MAX_FILE_SIZE) {
    console.warn('[Media] Document too large, skipping');
    return;
  }

  const ext = doc.file_name?.split('.').pop() || 'bin';
  const filePath = await saveFile(userId, buffer, ext);

  createMedia({
    taskId,
    userId,
    type: 'document',
    filePath,
    fileSize: buffer.length,
    mimeType: doc.mime_type || null,
    originalFilename: doc.file_name || null,
    telegramFileId: doc.file_id
  });

  console.log(`[Media] Document saved: ${filePath}`);
}

async function processVoice(
  taskId: string, 
  userId: number, 
  message: Message
): Promise<void> {
  if (!message.voice) return;

  const recentJobs = db.query<{ count: number }, [number, number]>(`
    SELECT COUNT(*) as count FROM media_queue 
    WHERE user_id = ? AND created_at > ?
  `).get(userId, Date.now() - MEDIA_QUEUE_CONFIG.RATE_LIMIT_WINDOW_MS);

  if (recentJobs && recentJobs.count >= MEDIA_QUEUE_CONFIG.MAX_JOBS_PER_USER_PER_MINUTE) {
    console.warn(`[Media] Rate limited user ${userId}`);
    updateTask(taskId, { 
      content: 'Голосовое сообщение (слишком много запросов)' 
    });
    return;
  }

  const voice = message.voice;
  const file = await bot.api.getFile(voice.file_id);
  
  if (!file.file_path) {
    console.error('[Media] No file_path in voice');
    return;
  }

  const buffer = await downloadTelegramFile(file.file_path);
  const filePath = await saveFile(userId, buffer, 'ogg');

  const media = createMedia({
    taskId,
    userId,
    type: 'voice',
    filePath,
    fileSize: buffer.length,
    mimeType: voice.mime_type || 'audio/ogg',
    telegramFileId: voice.file_id,
    transcriptionStatus: 'pending'
  });

  updateTask(taskId, { content: 'Голосовое сообщение' });

  enqueueTranscription(media.id, userId, filePath);

  console.log(`[Media] Voice saved and queued: ${filePath}`);
}

function enqueueTranscription(
  mediaId: string, 
  userId: number, 
  filePath: string
): void {
  const id = generateId();
  const now = Date.now();

  db.run(`
    INSERT INTO media_queue (
      id, media_id, user_id, job_type, file_path, 
      status, attempts, max_attempts, created_at, next_attempt_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    mediaId,
    userId,
    'transcription',
    filePath,
    'pending',
    0,
    3,
    now,
    now
  ]);

  console.log(`[Media] Transcription job queued: ${id}`);
}
