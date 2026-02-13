import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getTasks, countTasks, updateTask } from '../../db/tasks';
import { env } from '../../env';
import { handleHelp } from './commands';

const MAX_MESSAGE_LENGTH = 4096;
const MAX_TASK_PREVIEW = 100;

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatDeadline(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const deadlineDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (deadlineDate.getTime() === today.getTime()) {
    return `⏰ Сегодня ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  if (deadlineDate.getTime() === tomorrow.getTime()) {
    return `📅 Завтра`;
  }
  if (deadlineDate.getTime() < today.getTime()) {
    return `🔴 Просрочено`;
  }
  return `📅 ${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

export async function handleTodayButton(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const tasks = getTasks({ userId, status: 'active', limit: 25 });

  if (tasks.length === 0) {
    await ctx.reply('🎯 На сегодня задач нет!\n\nОтправьте сообщение, чтобы создать задачу.');
    return;
  }

  let message = `🎯 *Сегодня* (${tasks.length})\n\n`;
  let tasksShown = 0;

  for (const task of tasks.slice(0, 20)) {
    const deadlineStr = task.deadline 
      ? ` · ${formatDeadline(task.deadline)}`
      : '';

    const content = task.content.length > MAX_TASK_PREVIEW 
      ? task.content.slice(0, MAX_TASK_PREVIEW) + '...'
      : task.content;

    const taskLine = `${tasksShown + 1}. ${content}${deadlineStr}\n`;

    if (message.length + taskLine.length + 100 > MAX_MESSAGE_LENGTH) {
      message += `\n_...и ещё ${tasks.length - tasksShown}_`;
      break;
    }

    message += taskLine;
    tasksShown++;
  }

  if (tasksShown < tasks.length && !message.includes('...и ещё')) {
    message += `\n_...и ещё ${tasks.length - tasksShown}_`;
  }

  const keyboard = new InlineKeyboard();
  tasks.slice(0, 5).forEach((task, i) => {
    keyboard.text(`✅ ${i + 1}`, `complete:${task.id}`).row();
  });

  if (tasks.length > 5) {
    keyboard.webApp('Показать все', env.MINI_APP_URL);
  }

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

export async function handleInboxButton(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const count = countTasks(userId, 'inbox');

  if (count === 0) {
    await ctx.reply('📥 Inbox пуст!\n\n✨ Все задачи разобраны.');
    return;
  }

  const keyboard = new InlineKeyboard()
    .webApp('Разобрать в приложении', env.MINI_APP_URL);

  await ctx.reply(
    `📥 *Inbox*: ${count} ${pluralize(count, 'задача', 'задачи', 'задач')}\n\nОткройте приложение, чтобы разобрать.`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

export async function handleHelpButton(ctx: Context): Promise<void> {
  await handleHelp(ctx);
}

export async function handleCompleteCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const match = data.match(/^complete:(.+)$/);
  if (!match) return;

  const taskId = match[1];
  const userId = ctx.from?.id;
  if (!userId) return;

  updateTask(taskId, {
    status: 'done',
    completedAt: Date.now()
  });

  await ctx.answerCallbackQuery({ text: '✅ Выполнено!' });

  await refreshTodayMessage(ctx, userId);
}

async function refreshTodayMessage(ctx: Context, userId: number): Promise<void> {
  const tasks = getTasks({ userId, status: 'active', limit: 25 });

  if (tasks.length === 0) {
    await ctx.editMessageText('🎯 *Сегодня*\n\n✨ Все задачи выполнены!', {
      parse_mode: 'Markdown'
    });
    return;
  }

  let message = `🎯 *Сегодня* (${tasks.length})\n\n`;
  tasks.slice(0, 10).forEach((task, i) => {
    const deadlineStr = task.deadline 
      ? ` · ${formatDeadline(task.deadline)}`
      : '';
    const content = task.content.length > MAX_TASK_PREVIEW 
      ? task.content.slice(0, MAX_TASK_PREVIEW) + '...'
      : task.content;
    message += `${i + 1}. ${content}${deadlineStr}\n`;
  });

  const keyboard = new InlineKeyboard();
  tasks.slice(0, 5).forEach((task, i) => {
    keyboard.text(`✅ ${i + 1}`, `complete:${task.id}`).row();
  });

  if (tasks.length > 5) {
    keyboard.webApp('Показать все', env.MINI_APP_URL);
  }

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}
