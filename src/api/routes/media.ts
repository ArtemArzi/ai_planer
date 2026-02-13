import { Hono } from 'hono';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';
import { authMiddleware } from '../middleware/auth';
import { getTask } from '../../db/tasks';
import { getMediaForTask, getMedia, createMedia, deleteMedia } from '../../db/media';
import { generateId } from '../../db/index';

const UPLOADS_DIR = './uploads';
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats',
  'text/',
];

function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
}

function getExtensionFromMime(mimeType: string, filename?: string): string {
  if (filename) {
    const ext = filename.split('.').pop();
    if (ext) return ext;
  }
  if (mimeType.startsWith('image/jpeg')) return 'jpg';
  if (mimeType.startsWith('image/png')) return 'png';
  if (mimeType.startsWith('image/webp')) return 'webp';
  if (mimeType.startsWith('image/gif')) return 'gif';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'bin';
}

const media = new Hono();
media.use('*', authMiddleware);

media.get('/task/:taskId', async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('taskId');

  const task = getTask(taskId);
  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  const items = getMediaForTask(taskId);
  return c.json(items);
});

media.post('/task/:taskId', async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('taskId');

  const task = getTask(taskId);
  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'File is required', code: 'VALIDATION_ERROR' }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large (max 20MB)', code: 'VALIDATION_ERROR' }, 400);
  }

  const mimeType = file.type || 'application/octet-stream';
  if (!isAllowedMimeType(mimeType)) {
    return c.json({ error: 'File type not allowed', code: 'VALIDATION_ERROR' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = getExtensionFromMime(mimeType, file.name);
  const fileId = generateId();
  const userDir = path.join(UPLOADS_DIR, userId.toString());
  await mkdir(userDir, { recursive: true });
  const filePath = path.join(userDir, `${fileId}.${ext}`);
  await writeFile(filePath, buffer);

  const mediaType = mimeType.startsWith('image/') ? 'photo' : 'document';

  const mediaDTO = createMedia({
    taskId,
    userId,
    type: mediaType,
    filePath,
    fileSize: file.size,
    mimeType,
    originalFilename: file.name || null,
  });

  return c.json(mediaDTO, 201);
});

media.delete('/:mediaId', async (c) => {
  const userId = c.get('userId');
  const mediaId = c.req.param('mediaId');

  const mediaItem = getMedia(mediaId);
  if (!mediaItem || mediaItem.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  if (mediaItem.filePath) {
    try {
      await unlink(mediaItem.filePath);
    } catch {
      console.error(`[Media] Failed to delete file: ${mediaItem.filePath}`);
    }
  }

  deleteMedia(mediaId);

  return c.json({ success: true });
});

export default media;
