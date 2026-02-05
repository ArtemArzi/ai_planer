import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import health from './routes/health';
import users from './routes/users';
import tasks from './routes/tasks';
import files from './routes/files';
import { rateLimitMiddleware } from './middleware/rateLimit';

const api = new Hono();

api.use('*', logger());
api.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));

api.route('/health', health);
api.use('/me', rateLimitMiddleware);
api.use('/tasks', rateLimitMiddleware);
api.use('/files', rateLimitMiddleware);
api.route('/me', users);
api.route('/tasks', tasks);
api.route('/files', files);

api.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
});

api.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

export default api;
