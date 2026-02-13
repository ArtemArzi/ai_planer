import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { env } from './env';
import api from './api';
import { bot, setupMenuButton } from './bot';
import { registerBackgroundJobs } from './jobs';
import './db';

const app = new Hono();

app.route('/', api);

app.post('/webhook/:secret', async (c) => {
  const secret = c.req.param('secret');
  if (secret !== env.WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }
  return webhookCallback(bot, 'hono')(c);
});

console.log(`🚀 LAZY FLOW server starting...`);
console.log(`   Environment: ${env.NODE_ENV}`);
console.log(`   Port: ${env.PORT}`);
console.log(`   Database: ${env.DB_PATH}`);

registerBackgroundJobs();

bot.init().then(() => {
  console.log(`   Bot: @${bot.botInfo.username} initialized`);
  setupMenuButton();
}).catch((error) => {
  console.error('[Bot] Failed to initialize:', error);
  setupMenuButton();
});

if (env.isDev) {
  void bot.api.deleteWebhook({ drop_pending_updates: false }).catch((error) => {
    console.warn('[Bot] Failed to clear webhook in dev mode', error);
  });

  bot.start();
  console.log('   Bot: Long polling mode');
} else {
  const webhookUrl = `${env.APP_URL}/webhook/${env.WEBHOOK_SECRET}`;
  void bot.api.setWebhook(webhookUrl).then(() => {
    console.log(`   Bot: Webhook registered ${webhookUrl}`);
  }).catch((error) => {
    console.error('   Bot: Failed to register webhook', error);
  });

  console.log(`   Bot: Webhook mode at /webhook/${env.WEBHOOK_SECRET.slice(0, 4)}...`);
}

export default {
  port: env.PORT,
  fetch: app.fetch,
};
