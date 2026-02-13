import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from '../env';

import health from './routes/health';
import users from './routes/users';
import tasks from './routes/tasks';
import folders from './routes/folders';
import files from './routes/files';
import media from './routes/media';
import google from './routes/google';
import { rateLimitMiddleware } from './middleware/rateLimit';

const api = new Hono();
const corsOrigin = env.isProd ? env.CORS_ALLOWED_ORIGINS : '*';

api.use('*', logger());
api.use('*', cors({
  origin: corsOrigin,
  allowHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));

api.route('/health', health);
api.use('/me', rateLimitMiddleware);
api.use('/tasks', rateLimitMiddleware);
api.use('/folders', rateLimitMiddleware);
api.use('/files', rateLimitMiddleware);
api.use('/media', rateLimitMiddleware);
api.use('/google', rateLimitMiddleware);
api.route('/me', users);
api.route('/tasks', tasks);
api.route('/folders', folders);
api.route('/files', files);
api.route('/media', media);
api.route('/google', google);

api.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
});

api.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

export default api;
