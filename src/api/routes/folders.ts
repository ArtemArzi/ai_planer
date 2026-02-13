import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import {
  listFolders, createFolder, updateFolder, deleteFolder
} from '../../db/folders';
import { FOLDER_ICONS, FOLDER_COLORS } from '../../lib/folderDefaults';

const folders = new Hono();
folders.use('*', authMiddleware);

folders.get('/', async (c) => {
  const userId = c.get('userId');
  const items = listFolders(userId);
  return c.json({ items });
});

folders.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  if (!body.displayName || typeof body.displayName !== 'string') {
    return c.json({ error: 'displayName is required', code: 'VALIDATION_ERROR' }, 400);
  }

  const displayName = body.displayName.trim();
  if (!displayName || displayName.length > 50) {
    return c.json({ error: 'displayName must be 1-50 characters', code: 'VALIDATION_ERROR' }, 400);
  }

  const result = createFolder(userId, {
    displayName,
    icon: body.icon,
    color: body.color,
  });

  if (!result.ok) {
    const status = result.code === 'LIMIT_REACHED' ? 409
      : result.code === 'RESERVED_SLUG' ? 409
      : 400;
    return c.json({ error: result.error, code: result.code }, status);
  }

  return c.json(result.folder, 201);
});

folders.patch('/:slug', async (c) => {
  const userId = c.get('userId');
  const slug = c.req.param('slug');
  const body = await c.req.json();

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string') {
      return c.json({ error: 'displayName must be a string', code: 'VALIDATION_ERROR' }, 400);
    }
    const trimmed = body.displayName.trim();
    if (!trimmed || trimmed.length > 50) {
      return c.json({ error: 'displayName must be 1-50 characters', code: 'VALIDATION_ERROR' }, 400);
    }
  }

  const result = updateFolder(userId, slug, {
    displayName: body.displayName,
    icon: body.icon,
    color: body.color,
  });

  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404
      : result.code === 'SYSTEM_RESTRICTED' ? 403
      : 400;
    return c.json({ error: result.error, code: result.code }, status);
  }

  return c.json(result.folder);
});

folders.delete('/:slug', async (c) => {
  const userId = c.get('userId');
  const slug = c.req.param('slug');

  const result = deleteFolder(userId, slug);

  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404
      : result.code === 'SYSTEM_RESTRICTED' ? 403
      : 400;
    return c.json({ error: result.error, code: result.code }, status);
  }

  return c.json({ success: true, movedTaskCount: result.movedTaskCount });
});

folders.get('/meta', async (c) => {
  return c.json({
    icons: FOLDER_ICONS,
    colors: FOLDER_COLORS,
  });
});

export default folders;
