import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { 
  createTask, getTask, getTasks, updateTask,
  countTasksByStatus, searchTasks
} from '../../db/tasks';
import { getUser } from '../../db/users';
import { folderExists } from '../../db/folders';
import type { TaskStatus, FolderSlug } from '../../lib/types';
import {
  buildNextRecurringSchedule,
  getTodayDateString,
  isDateString,
  isRecurrenceRule,
  isTimeString,
  buildDeadlineFromSchedule,
} from '../../lib/recurrence';
import {
  deleteTaskFromGoogleCalendar,
  isGoogleCalendarConfigured,
  upsertTaskInGoogleCalendar,
} from '../../lib/google';
import { classifyTaskAsync } from '../../lib/ai';

const tasks = new Hono();
tasks.use('*', authMiddleware);

tasks.get('/', async (c) => {
  const userId = c.get('userId');
  const status = c.req.query('status') as TaskStatus | undefined;
  const folder = c.req.query('folder') as FolderSlug | undefined;
  const forDateQuery = c.req.query('forDate');
  const cursor = c.req.query('cursor');
  const parsedLimit = parseInt(c.req.query('limit') || '50', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(parsedLimit, 100) : 50;

  if (forDateQuery !== undefined && !isDateString(forDateQuery)) {
    return c.json({ error: 'Invalid forDate format (YYYY-MM-DD)', code: 'VALIDATION_ERROR' }, 400);
  }
  
  const items = getTasks({
    userId,
    status,
    folder,
    forDate: forDateQuery,
    cursor,
    limit
  });
  
  return c.json({
    items,
    cursor: items.length === limit ? items[items.length - 1]?.id : null,
    hasMore: items.length === limit
  });
});

tasks.get('/upcoming', async (c) => {
  const userId = c.get('userId');
  const forDateQuery = c.req.query('forDate');
  const parsedLimit = parseInt(c.req.query('limit') || '50', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(parsedLimit, 100) : 50;

  if (forDateQuery !== undefined && !isDateString(forDateQuery)) {
    return c.json({ error: 'Invalid forDate format (YYYY-MM-DD)', code: 'VALIDATION_ERROR' }, 400);
  }

  const anchorDate = forDateQuery || getTodayDateString();
  const items = getTasks({
    userId,
    status: 'active',
    afterDate: anchorDate,
    limit,
    sortBy: 'scheduled'
  });

  return c.json({
    items,
    cursor: items.length === limit ? items[items.length - 1]?.id : null,
    hasMore: items.length === limit
  });
});

tasks.get('/stats', async (c) => {
  const userId = c.get('userId');

  return c.json(countTasksByStatus(userId));
});

tasks.get('/search', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q');
  
  if (!query || query.length < 2) {
    return c.json([]);
  }
  
  return c.json(searchTasks(userId, query, 50));
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

  const folder = body.folder || 'personal';
  if (!folderExists(userId, folder)) {
    return c.json({ error: `Folder "${folder}" does not exist`, code: 'INVALID_FOLDER' }, 400);
  }

  if (body.scheduledDate !== undefined && body.scheduledDate !== null && !isDateString(body.scheduledDate)) {
    return c.json({ error: 'Invalid scheduledDate format (YYYY-MM-DD)', code: 'VALIDATION_ERROR' }, 400);
  }

  if (body.scheduledTime !== undefined && body.scheduledTime !== null && !isTimeString(body.scheduledTime)) {
    return c.json({ error: 'Invalid scheduledTime format (HH:MM)', code: 'VALIDATION_ERROR' }, 400);
  }

  if (body.recurrenceRule !== undefined && body.recurrenceRule !== null && !isRecurrenceRule(body.recurrenceRule)) {
    return c.json({ error: 'Invalid recurrenceRule', code: 'VALIDATION_ERROR' }, 400);
  }

  let deadline = body.deadline ?? null;
  const user = getUser(userId);

  if (!deadline && body.scheduledDate && body.scheduledTime) {
    deadline = buildDeadlineFromSchedule(body.scheduledDate, body.scheduledTime, user?.timezone);
  }
  
  const task = createTask({
    userId,
    content,
    description: typeof body.description === 'string' ? body.description : null,
    folder,
    status: body.status || 'active',
    type: content.length > 500 ? 'note' : 'task',
    source: 'miniapp',
    deadline,
    scheduledDate: body.scheduledDate ?? null,
    scheduledTime: body.scheduledTime ?? null,
    recurrenceRule: body.recurrenceRule ?? null
  });

  if (!body.folder || body.folder === 'personal') {
    classifyTaskAsync(task.id, task.createdAt).catch(err => {
      console.error('[API] AI classification error:', err);
    });
  }

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
  


  if (updates.folder !== undefined && !folderExists(userId, updates.folder)) {
    return c.json({ error: `Folder "${updates.folder}" does not exist`, code: 'INVALID_FOLDER' }, 400);
  }

  if (updates.scheduledDate !== undefined && updates.scheduledDate !== null && !isDateString(updates.scheduledDate)) {
    return c.json({ error: 'Invalid scheduledDate format (YYYY-MM-DD)', code: 'VALIDATION_ERROR' }, 400);
  }

  if (updates.scheduledTime !== undefined && updates.scheduledTime !== null && !isTimeString(updates.scheduledTime)) {
    return c.json({ error: 'Invalid scheduledTime format (HH:MM)', code: 'VALIDATION_ERROR' }, 400);
  }

  if (updates.recurrenceRule !== undefined && updates.recurrenceRule !== null && !isRecurrenceRule(updates.recurrenceRule)) {
    return c.json({ error: 'Invalid recurrenceRule', code: 'VALIDATION_ERROR' }, 400);
  }

  const user = getUser(userId);

  if (
    updates.deadline === undefined && 
    (updates.scheduledDate !== undefined || updates.scheduledTime !== undefined)
  ) {
    const scheduledDate = updates.scheduledDate !== undefined ? updates.scheduledDate : task.scheduledDate;
    const scheduledTime = updates.scheduledTime !== undefined ? updates.scheduledTime : task.scheduledTime;
    
    if (scheduledDate && scheduledTime) {
      updates.deadline = buildDeadlineFromSchedule(scheduledDate, scheduledTime, user?.timezone);
    } else if (scheduledDate === null || scheduledTime === null) {
      updates.deadline = null;
    }
  }

  const isTransitionToDone = updates.status === 'done' && task.status !== 'done';
  
  if (isTransitionToDone) {
    updates.completedAt = Date.now();
  }
  if (updates.status === 'deleted') {
    updates.deletedAt = Date.now();
  }
  
  updates.lastInteractionAt = Date.now();
  
  let updated = updateTask(taskId, updates);

  if (isTransitionToDone && updated && updated.type === 'task' && updated.recurrenceRule) {
    try {
      const { scheduledDate, deadline } = buildNextRecurringSchedule({
        scheduledDate: updated.scheduledDate,
        scheduledTime: updated.scheduledTime,
        deadline: updated.deadline,
        recurrenceRule: updated.recurrenceRule
      }, user?.timezone);

      createTask({
        userId: updated.userId,
        content: updated.content,
        type: updated.type,
        status: 'active',
        folder: updated.folder,
        source: updated.source,
        deadline,
        scheduledDate,
        scheduledTime: updated.scheduledTime,
        recurrenceRule: updated.recurrenceRule
      });
    } catch (error) {
      console.error('[Tasks] Failed to create recurring next occurrence:', error);
    }
  }

  return c.json(updated);
});

tasks.post('/:id/google-calendar', async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  const task = getTask(taskId);

  if (!task || task.userId !== userId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const action = body.action;

  if (action !== 'add' && action !== 'remove') {
    return c.json({ error: 'Invalid action. Use add or remove', code: 'VALIDATION_ERROR' }, 400);
  }

  try {
    if (action === 'remove') {
      if (!task.googleEventId) {
        return c.json(task);
      }

      if (isGoogleCalendarConfigured()) {
        const user = getUser(userId);
        if (user?.hasGoogleCalendar) {
          await deleteTaskFromGoogleCalendar(userId, task.googleEventId);
        }
      }

      const updated = updateTask(taskId, { googleEventId: null });
      return c.json(updated || task);
    }

    if (!isGoogleCalendarConfigured()) {
      return c.json({ error: 'Google Calendar is not configured', code: 'GOOGLE_NOT_CONFIGURED' }, 503);
    }

    const user = getUser(userId);
    if (!user?.hasGoogleCalendar) {
      return c.json({ error: 'Google Calendar is not connected', code: 'GOOGLE_NOT_CONNECTED' }, 409);
    }

    if (!task.deadline) {
      return c.json({ error: 'Task must have date and time before adding to Google Calendar', code: 'VALIDATION_ERROR' }, 400);
    }

    const googleEventId = await upsertTaskInGoogleCalendar(userId, task);
    if (!googleEventId) {
      return c.json({ error: 'Google Calendar is not connected', code: 'GOOGLE_NOT_CONNECTED' }, 409);
    }

    const updated = googleEventId !== task.googleEventId
      ? updateTask(taskId, { googleEventId })
      : task;

    return c.json(updated || task);
  } catch (error) {
    console.error('[Tasks] Google Calendar action failed:', error);
    return c.json({ error: 'Google Calendar action failed', code: 'GOOGLE_ACTION_FAILED' }, 502);
  }
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

  if (updates.folder !== undefined && !folderExists(userId, updates.folder)) {
    return c.json({ error: `Folder "${updates.folder}" does not exist`, code: 'INVALID_FOLDER' }, 400);
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
