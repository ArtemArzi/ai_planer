import { InlineKeyboard, type Context } from 'grammy';
import { upsertUser, getUser, deleteUser } from '../../db/users';
import { getMainKeyboard, getDeleteConfirmKeyboard } from '../keyboards';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../../env';

export async function handleStart(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  await upsertUser({
    telegramId: from.id,
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    languageCode: from.language_code
  });

  await ctx.reply(
    `👋 *Привет!*\n\n` +
    `Я — твой персональный помощник по управлению делами.\n\n` +
    `📥 *Выгружай мысли*: просто пиши мне всё, что нужно сделать или запомнить. Я сам разберусь, куда это положить.\n\n` +
    `📱 *Планируй в приложении*: нажми кнопку ниже или в меню, чтобы увидеть свои полки с задачами, настроить дедлайны и расставить приоритеты.\n\n` +
    `_Попробуй прямо сейчас: напиши любую задачу или идею!_`,
    {
      parse_mode: 'Markdown',
      reply_markup: getMainKeyboard()
    }
  );

  const openAppKeyboard = new InlineKeyboard().webApp('📱 Открыть приложение', env.MINI_APP_URL);
  await ctx.reply('Твои задачи здесь:', { reply_markup: openAppKeyboard });
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    `📖 *Как пользоваться LAZY FLOW*\n\n` +
    `*1. Просто пиши мне*\n` +
    `Любое сообщение станет задачей в твоём Inbox. Не нужно ломать голову над форматом.\n\n` +
    `*2. Быстрая сортировка (теги)*\n` +
    `Хочешь сразу в нужную папку? Начни сообщение с префикса:\n` +
    `• \`р:\` — 💼 Работа\n` +
    `• \`л:\` — 🏠 Личное\n` +
    `• \`и:\` — 💡 Идеи\n` +
    `• \`з:\` — 📝 Заметки\n` +
    `_Пример: «р: Подготовить отчет»_\n\n` +
    `*3. Умные дедлайны*\n` +
    `Я понимаю время в тексте:\n` +
    `• «завтра в 10:00»\n` +
    `• «через 2 дня»\n` +
    `• «в понедельник вечером»\n\n` +
    `*4. Списки задач*\n` +
    `Отправь список через \`;\` или каждый пункт с новой строки (с дефисом), и я создам несколько задач сразу.\n\n` +
    `*5. Заметки*\n` +
    `Длинные сообщения (более 500 символов) автоматически сохраняются как заметки.\n\n` +
    `📱 *В приложении:* нажимай на задачу, чтобы отредактировать текст или описание. Пользуйся свайпами для навигации.\n\n` +
    `_Действуй! Напиши свою первую задачу._`,
    {
      parse_mode: 'Markdown',
      reply_markup: getMainKeyboard()
    }
  );
}

export async function handleDeleteMe(ctx: Context): Promise<void> {
  await ctx.reply(
    `⚠️ *Удаление аккаунта*\n\n` +
    `Это удалит:\n` +
    `• Все задачи и заметки\n` +
    `• Все файлы и медиа\n` +
    `• Google Calendar связь\n` +
    `• Все настройки\n\n` +
    `_Действие необратимо!_`,
    {
      parse_mode: 'Markdown',
      reply_markup: getDeleteConfirmKeyboard()
    }
  );
}

export async function handleDeleteConfirm(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const user = getUser(userId);
    
    const uploadsPath = path.join(process.cwd(), 'uploads', String(userId));
    await fs.rm(uploadsPath, { recursive: true, force: true }).catch(() => {});
    
    const deleted = deleteUser(userId);
    
    if (deleted) {
      await ctx.editMessageText(
        '✅ *Все данные удалены*\n\n' +
        'Спасибо, что пользовались LAZY FLOW!\n' +
        'Если захотите вернуться — отправьте /start',
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.editMessageText('❌ Пользователь не найден.');
    }
  } catch (error) {
    console.error('[Bot] Delete user failed:', error);
    await ctx.editMessageText('❌ Ошибка при удалении. Попробуйте позже.');
  }
}

export async function handleDeleteCancel(ctx: Context): Promise<void> {
  await ctx.editMessageText('👍 Отменено. Ваши данные в безопасности.');
}
