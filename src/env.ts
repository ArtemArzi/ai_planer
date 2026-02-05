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

export const env = {
  // Required
  BOT_TOKEN: requireEnv('BOT_TOKEN'),
  
  // Optional with defaults
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: parseInt(optionalEnv('PORT', '3000')),
  APP_URL: optionalEnv('APP_URL', 'http://localhost:3000'),
  MINI_APP_URL: optionalEnv('MINI_APP_URL', 'http://localhost:5173'),
  WEBHOOK_SECRET: optionalEnv('WEBHOOK_SECRET', 'dev-secret'),
  DB_PATH: optionalEnv('DB_PATH', './data/lazyflow.db'),
  
  // Optional - AI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  
  // Derived
  isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  isProd: optionalEnv('NODE_ENV', 'development') === 'production',
};

// Validate on import
if (env.isProd && !env.OPENAI_API_KEY) {
  console.warn('[env] Warning: OPENAI_API_KEY not set in production');
}
