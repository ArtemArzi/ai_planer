function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}

function parseCorsAllowlist(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const NODE_ENV = optionalEnv('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';
const isDev = NODE_ENV === 'development';

const APP_URL = isProd ? requireEnv('APP_URL') : optionalEnv('APP_URL', 'http://localhost:3000');
const MINI_APP_URL = isProd ? requireEnv('MINI_APP_URL') : optionalEnv('MINI_APP_URL', 'http://localhost:5173');
const WEBHOOK_SECRET = isProd ? requireEnv('WEBHOOK_SECRET') : optionalEnv('WEBHOOK_SECRET', 'dev-secret');
const DB_PATH = optionalEnv('DB_PATH', isProd ? '/app/data/lazyflow.db' : './data/lazyflow.db');

const rawCorsOrigins = isProd
  ? requireEnv('CORS_ALLOWED_ORIGINS')
  : optionalEnv('CORS_ALLOWED_ORIGINS', '*');

const CORS_ALLOWED_ORIGINS = rawCorsOrigins === '*'
  ? ['*']
  : parseCorsAllowlist(rawCorsOrigins);

if (isProd) {
  if (!APP_URL.startsWith('https://')) {
    throw new Error('APP_URL must use HTTPS in production');
  }

  if (!MINI_APP_URL.startsWith('https://')) {
    throw new Error('MINI_APP_URL must use HTTPS in production');
  }

  if (WEBHOOK_SECRET === 'dev-secret' || WEBHOOK_SECRET.length < 24) {
    throw new Error('WEBHOOK_SECRET is too weak for production');
  }

  if (CORS_ALLOWED_ORIGINS.length === 0 || CORS_ALLOWED_ORIGINS.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS must be an explicit allowlist in production');
  }

  for (const origin of CORS_ALLOWED_ORIGINS) {
    if (!origin.startsWith('https://') && !origin.startsWith('http://')) {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }
}

export const env = {
  // Required
  BOT_TOKEN: requireEnv('BOT_TOKEN'),

  // Optional with defaults
  NODE_ENV,
  PORT: parsePort(optionalEnv('PORT', '3000')),
  APP_URL,
  MINI_APP_URL,
  WEBHOOK_SECRET,
  DB_PATH,
  CORS_ALLOWED_ORIGINS,

  // Optional - AI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // Contextual split feature flags
  AI_CONTEXT_SPLIT_ENABLED: process.env.AI_CONTEXT_SPLIT_ENABLED === 'true',
  AI_CONTEXT_SPLIT_MODE: (process.env.AI_CONTEXT_SPLIT_MODE || 'off') as 'off' | 'shadow' | 'apply',
  AI_CONTEXT_SPLIT_TIMEOUT_MS: parseInt(process.env.AI_CONTEXT_SPLIT_TIMEOUT_MS || '3000', 10),

  // Optional - Google Calendar
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',
  GOOGLE_OAUTH_SCOPES: process.env.GOOGLE_OAUTH_SCOPES || 'https://www.googleapis.com/auth/calendar.events',
  GOOGLE_OAUTH_STATE_SECRET: process.env.GOOGLE_OAUTH_STATE_SECRET || WEBHOOK_SECRET,

  // Derived
  isDev,
  isProd,
  isGoogleCalendarConfigured: !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  ),
};

// Validate on import
if (env.isProd && !env.OPENAI_API_KEY) {
  console.warn('[env] Warning: OPENAI_API_KEY not set in production');
}
