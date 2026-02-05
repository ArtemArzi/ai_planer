import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getMedia } from '../../db/media';

const files = new Hono();
files.use('*', authMiddleware);

files.get('/:mediaId', async (c) => {
  const userId = c.get('userId');
  const mediaId = c.req.param('mediaId');
  
  const media = getMedia(mediaId);
  
  if (!media || media.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  
  if (!media.filePath) {
    return c.json({ error: 'No file', code: 'NO_FILE' }, 404);
  }
  
  const file = Bun.file(media.filePath);
  
  if (!await file.exists()) {
    return c.json({ error: 'File not found', code: 'FILE_NOT_FOUND' }, 404);
  }
  
  return new Response(file.stream(), {
    headers: {
      'Content-Type': media.mimeType || 'application/octet-stream',
      'Content-Length': String(media.fileSize || file.size),
      'Cache-Control': 'private, max-age=86400'
    }
  });
});

export default files;
