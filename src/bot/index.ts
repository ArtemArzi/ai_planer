import { Bot, Context, session, GrammyError, HttpError } from 'grammy';
import type { SessionFlavor } from 'grammy';
import { env } from '../env';
import { updateUser } from '../db/users';
import {
  handleStart,
  handleHelp,
  handleDeleteMe,
  handleDeleteConfirm,
  handleDeleteCancel
} from './handlers/commands';
import { handleMessage, handleEditedMessage } from './handlers/message';
import {
  handleTodayButton,
  handleInboxButton,
  handleHelpButton,
  handleCompleteCallback
} from './handlers/keyboard';

interface SessionData {
  lastTaskId?: string;
}

type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(env.BOT_TOKEN);

bot.use(session({
  initial: (): SessionData => ({})
}));

const userRequests = new Map<number, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const MAX_REQUESTS = 30;

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  
  const now = Date.now();
  const requests = userRequests.get(userId) || [];
  const recent = requests.filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (recent.length >= MAX_REQUESTS) {
    await ctx.reply('⏳ Слишком много сообщений. Подождите минуту.', {
      reply_to_message_id: ctx.message?.message_id
    });
    return;
  }
  
  recent.push(now);
  userRequests.set(userId, recent);
  
  return next();
});

bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== 'private') {
    return;
  }
  return next();
});

bot.command('start', handleStart);
bot.command('help', handleHelp);
bot.command('delete_me', handleDeleteMe);

bot.callbackQuery('delete_confirm', handleDeleteConfirm);
bot.callbackQuery('delete_cancel', handleDeleteCancel);
bot.callbackQuery(/^complete:/, handleCompleteCallback);

bot.hears('🎯 Сегодня', handleTodayButton);
bot.hears('📥 Inbox', handleInboxButton);
bot.hears('❓ Помощь', handleHelpButton);

bot.on('message', handleMessage);
bot.on('edited_message', handleEditedMessage);

export async function setupMenuButton() {
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '📱 Открыть',
        web_app: { url: env.MINI_APP_URL }
      }
    });
    console.log('[Bot] Menu button set to Mini App');
  } catch (e) {
    console.error('[Bot] Failed to set menu button:', e);
  }
}

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[Bot] Error for update ${ctx.update.update_id}:`);
  
  if (err.error instanceof GrammyError) {
    const description = err.error.description;
    
    if (description.includes('bot was blocked') || 
        description.includes('user is deactivated') ||
        description.includes('chat not found')) {
      const userId = ctx.from?.id;
      if (userId) {
        updateUser(userId, { notificationsEnabled: false });
        console.log(`[Bot] User ${userId} blocked bot, notifications disabled`);
      }
      return;
    }
    
    console.error('[Bot] Telegram error:', description);
  } else if (err.error instanceof HttpError) {
    console.error('[Bot] HTTP error:', err.error);
  } else {
    console.error('[Bot] Unknown error:', err.error);
  }
});
