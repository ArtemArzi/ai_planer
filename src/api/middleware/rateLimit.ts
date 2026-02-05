import type { Context, Next } from 'hono';

interface RateLimitEntry {
  requests: number[];
  warned: boolean;
}

const userLimits = new Map<number, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

export async function rateLimitMiddleware(c: Context, next: Next) {
  const userId = c.get('userId');
  
  // Skip if no auth (health check, etc.)
  if (!userId) {
    return next();
  }
  
  const now = Date.now();
  const entry = userLimits.get(userId) || { requests: [], warned: false };
  
  // Filter old requests
  entry.requests = entry.requests.filter(t => now - t < WINDOW_MS);
  
  if (entry.requests.length >= MAX_REQUESTS) {
    if (!entry.warned) {
      entry.warned = true;
      userLimits.set(userId, entry);
    }
    
    return c.json({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      retryAfter: 60
    }, 429);
  }
  
  // Reset warned if slowed down
  if (entry.requests.length < MAX_REQUESTS * 0.7) {
    entry.warned = false;
  }
  
  entry.requests.push(now);
  userLimits.set(userId, entry);
  
  return next();
}
