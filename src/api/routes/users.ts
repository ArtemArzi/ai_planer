import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getUser, updateUser, deleteUser } from '../../db/users';
import { getTasks } from '../../db/tasks';
import { rmSync } from 'fs';
import { join, resolve } from 'path';

const users = new Hono();

// Apply auth to all routes
users.use('*', authMiddleware);

// GET /me - Get current user profile
users.get('/', async (c) => {
  const userId = c.get('userId');
  const user = getUser(userId);
  
  if (!user) {
    return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404);
  }
  
  // SECURITY: Never expose OAuth tokens!
  return c.json(user);
});

// PATCH /me/settings - Update user settings
users.patch('/settings', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  // Allowed fields only
  const allowedFields = [
    'timezone', 'notificationsEnabled', 'morningDigestTime',
    'deadlineReminderMinutes', 'storiesNotifications', 'aiClassificationEnabled'
  ] as const;
  
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  
  const updated = updateUser(userId, updates as any);
  if (!updated) {
    return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404);
  }
  
  return c.json(updated);
});

// DELETE /me - Delete account (GDPR)
users.delete('/', async (c) => {
  const userId = c.get('userId');
  
  // Delete user files
  try {
    const uploadsPath = resolve(process.cwd(), 'uploads', String(userId));
    rmSync(uploadsPath, { recursive: true, force: true });
  } catch {}
  
  // Delete from DB (CASCADE handles tasks, media)
  const deleted = deleteUser(userId);
  
  if (!deleted) {
    return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404);
  }
  
  return c.json({ success: true, message: 'All data deleted' });
});

// GET /export - GDPR data export
users.get('/export', async (c) => {
  const userId = c.get('userId');
  const user = getUser(userId);
  
  if (!user) {
    return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404);
  }
  
  // Get all tasks (no status filter)
  const tasks = getTasks({ userId, limit: 100000 });
  
  const exportData = {
    exportedAt: new Date().toISOString(),
    user,
    tasks: tasks.map(t => ({
      id: t.id,
      content: t.content,
      type: t.type,
      status: t.status,
      folder: t.folder,
      deadline: t.deadline,
      createdAt: t.createdAt,
      completedAt: t.completedAt
    })),
    taskCount: tasks.length
  };
  
  return c.json(exportData, 200, {
    'Content-Disposition': `attachment; filename="lazyflow-export-${userId}-${Date.now()}.json"`
  });
});

export default users;
