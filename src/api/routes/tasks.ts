import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { 
  createTask, getTask, getTasks, updateTask, 
  findTaskByTelegramMessageId, countTasks 
} from '../../db/tasks';
import type { TaskStatus, Folder } from '../../lib/types';

const tasks = new Hono();
tasks.use('*', authMiddleware);

tasks.get('/', async (c) => {
  const userId = c.get('userId');
  const status = c.req.query('status') as TaskStatus | undefined;
  const folder = c.req.query('folder') as Folder | undefined;
  const cursor = c.req.query('cursor');
  const limit = parseInt(c.req.query('limit') || '50');
  
  const items = getTasks({
    userId,
    status,
    folder,
    cursor,
    limit: Math.min(limit, 100)
  });
  
  return c.json({
    items,
    cursor: items.length === limit ? items[items.length - 1]?.id : null,
    hasMore: items.length === limit
  });
});

tasks.get('/stats', async (c) => {
  const userId = c.get('userId');
  
  return c.json({
    inbox: countTasks(userId, 'inbox'),
    active: countTasks(userId, 'active'),
    backlog: countTasks(userId, 'backlog'),
    done: countTasks(userId, 'done'),
    total: countTasks(userId)
  });
});

tasks.get('/search', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q');
  
  if (!query || query.length < 2) {
    return c.json([]);
  }
  
  const allTasks = getTasks({ userId, limit: 1000 });
  const filtered = allTasks.filter(t => 
    t.status !== 'deleted' && 
    t.content.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50);
  
  return c.json(filtered);
});

tasks.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  if (!body.content || typeof body.content !== 'string') {
    return c.json({ error: 'Content is required', code: 'VALIDATION_ERROR' }, 400);
  }
  
  const content = body.content.trim();
  if (!content) {
    return c.json({ error: 'Content cannot be empty', code: 'VALIDATION_ERROR' }, 400);
  }
  
  if (content.length > 10000) {
    return c.json({ error: 'Content too long (max 10000 chars)', code: 'VALIDATION_ERROR' }, 400);
  }
  
  if (body.deadline && body.deadline < Date.now()) {
    return c.json({ error: 'Deadline cannot be in the past', code: 'VALIDATION_ERROR' }, 400);
  }
  
  const task = createTask({
    userId,
    content,
    folder: body.folder || 'personal',
    status: body.status || 'active',
    type: content.length > 500 ? 'note' : 'task',
    source: 'miniapp',
    deadline: body.deadline || null
  });
  
  return c.json(task, 201);
});

tasks.get('/:id', async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  
  const task = getTask(taskId);
  
  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  
  return c.json(task);
});

tasks.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  const updates = await c.req.json();
  
  const task = getTask(taskId);
  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  
  if (updates.expectedUpdatedAt !== undefined) {
    if (task.updatedAt !== updates.expectedUpdatedAt) {
      return c.json({
        error: 'Conflict: task was modified',
        code: 'CONFLICT',
        currentTask: task
      }, 409);
    }
    delete updates.expectedUpdatedAt;
  }
  
  if (updates.deadline && updates.deadline < Date.now()) {
    return c.json({ error: 'Deadline cannot be in the past', code: 'VALIDATION_ERROR' }, 400);
  }
  
  if (updates.status === 'done' && task.status !== 'done') {
    updates.completedAt = Date.now();
  }
  if (updates.status === 'deleted') {
    updates.deletedAt = Date.now();
  }
  
  updates.lastInteractionAt = Date.now();
  
  const updated = updateTask(taskId, updates);
  return c.json(updated);
});

tasks.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  
  const task = getTask(taskId);
  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  
  updateTask(taskId, {
    status: 'deleted',
    deletedAt: Date.now()
  });
  
  return c.json({ success: true });
});

tasks.patch('/batch', async (c) => {
  const userId = c.get('userId');
  const { ids, updates } = await c.req.json();
  
  if (!ids?.length || ids.length > 100) {
    return c.json({ error: 'Invalid ids (1-100 required)', code: 'VALIDATION_ERROR' }, 400);
  }
  
  const validIds: string[] = [];
  const skippedIds: string[] = [];
  
  for (const id of ids) {
    const task = getTask(id);
    if (task && task.userId === userId) {
      updateTask(id, {
        ...updates,
        lastInteractionAt: Date.now()
      });
      validIds.push(id);
    } else {
      skippedIds.push(id);
    }
  }
  
  return c.json({
    success: true,
    updatedCount: validIds.length,
    updatedIds: validIds,
    skippedCount: skippedIds.length,
    skippedIds: skippedIds.length > 0 ? skippedIds : undefined
  });
});

export default tasks;
