import { createHmac } from 'crypto';
import type { Context, Next } from 'hono';
import { upsertUser } from '../../db/users';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
}

export function validateInitData(initData: string | null | undefined): TelegramInitData | null {
  if (!initData) return null;
  
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    
    if (!hash) return null;
    
    const authDateStr = params.get('auth_date');
    if (!authDateStr) return null;
    
    const authDate = parseInt(authDateStr, 10);
    const maxAge = 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    
    if (now - authDate > maxAge) {
      return null;
    }
    
    params.delete('hash');
    
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      console.error('[Auth] BOT_TOKEN not set');
      return null;
    }
    
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    const expectedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    if (hash !== expectedHash) {
      return null;
    }
    
    const userStr = params.get('user');
    if (!userStr) return null;
    
    const user = JSON.parse(userStr) as TelegramUser;
    
    return {
      user,
      auth_date: authDate,
      hash
    };
  } catch (error) {
    console.error('[Auth] Failed to validate initData:', error);
    return null;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const initData = c.req.header('X-Telegram-Init-Data');
  
  if (!initData) {
    return c.json({ error: 'Missing init data', code: 'AUTH_MISSING' }, 401);
  }
  
  const data = validateInitData(initData);
  
  if (!data) {
    return c.json({ error: 'Invalid init data', code: 'AUTH_INVALID' }, 401);
  }
  
  c.set('userId', data.user.id);
  c.set('user', data.user);
  c.set('initData', data);

  upsertUser({
    telegramId: data.user.id,
    username: data.user.username,
    firstName: data.user.first_name,
    lastName: data.user.last_name,
    languageCode: data.user.language_code
  });
  
  await next();
}

declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    user: TelegramUser;
    initData: TelegramInitData;
  }
}
