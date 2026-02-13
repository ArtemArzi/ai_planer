import type { Context } from 'grammy';
import type { Message } from 'grammy/types';
import {
  processMessage as captureMessage,
  splitMultiCapture,
  buildFolderPrefixAliases,
} from '../../lib/capture';
import { createTask, findTaskByTelegramMessageId, updateTask } from '../../db/tasks';
import { getUser, upsertUser } from '../../db/users';
import { listFolders } from '../../db/folders';
import { getMainKeyboard } from '../keyboards';
import { processMediaMessage } from './media';
import type { MediaType } from '../../lib/types';

interface MediaGroupEntry {
  messages: Message[];
  timer: ReturnType<typeof setTimeout>;
  userId: number;
  ctx: Context;
}

const mediaGroupBuffer = new Map<string, MediaGroupEntry>();
const MEDIA_GROUP_DEBOUNCE_MS = 500;

const UNSUPPORTED_TYPES = ['sticker', 'animation', 'video_note', 'poll',
                           'location', 'venue', 'contact', 'dice', 'game'] as const;

const KEYBOARD_TEXTS = ['🎯 Сегодня', '📥 Inbox', '❓ Помощь'];

function getMediaType(message: Message): MediaType | undefined {
  if (message.photo) return 'photo';
  if (message.document) return 'document';
  if (message.voice) return 'voice';
  return undefined;
}

function hasUnsupportedType(message: Message): boolean {
  return UNSUPPORTED_TYPES.some(type => type in message);
}

function isTaskIdempotencyError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: tasks.user_id, tasks.telegram_message_id');
}

function getUserFolderAliases(userId: number) {
  const folders = listFolders(userId);
  return buildFolderPrefixAliases(
    folders.map((folder) => ({
      slug: folder.slug,
      displayName: folder.displayName,
    })),
  );
}

export async function handleMessage(ctx: Context): Promise<void> {
  const message = ctx.message;
  if (!message) return;
  
  const userId = ctx.from?.id;
  if (!userId) return;

  if (hasUnsupportedType(message)) {
    await ctx.reply('❌ Этот тип сообщения не поддерживается. Отправьте текст, фото, документ или голосовое.');
    return;
  }

  if (message.text && KEYBOARD_TEXTS.includes(message.text)) {
    return;
  }

  const mediaGroupId = message.media_group_id;
  if (mediaGroupId) {
    await handleMediaGroupMessage(ctx, message, userId, mediaGroupId);
    return;
  }

  await processSingleMessage(ctx, message, userId);
}

async function processSingleMessage(
  ctx: Context, 
  message: Message, 
  userId: number
): Promise<void> {
  const text = message.text || message.caption || '';
  const mediaType = getMediaType(message);

  if (!text.trim() && !mediaType) {
    await ctx.reply('❌ Пустое сообщение. Отправьте текст или медиа.');
    return;
  }

  try {
    const user = getUser(userId);
    if (!user) {
      upsertUser({
        telegramId: userId,
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        languageCode: ctx.from?.language_code
      });
    }

    const folderAliases = getUserFolderAliases(userId);
    const timezone = user?.timezone || 'UTC';
    const items = mediaType ? [text] : splitMultiCapture(text, folderAliases);

    if (!mediaType && items.length === 0) {
      await ctx.reply('❌ Не удалось извлечь задачи. Добавьте текст.');
      return;
    }

    let processedCount = 0;

    for (let index = 0; index < items.length; index += 1) {
      const itemText = items[index];
      const captureResult = captureMessage(itemText, {
        hasMedia: !!mediaType,
        mediaType,
        folderAliases,
        timezone,
      });

      const content = captureResult.content || (mediaType ? `[${mediaType}]` : '');
      if (!content.trim()) {
        continue;
      }

      const telegramMessageId = items.length === 1
        ? message.message_id
        : index === 0
          ? message.message_id
          : -(message.message_id * 100 + index);

      try {
        const task = createTask({
          userId,
          content,
          type: captureResult.type,
          status: captureResult.status,
          folder: captureResult.folder,
          source: 'bot',
          telegramMessageId,
          scheduledDate: captureResult.scheduledDate ?? undefined,
          scheduledTime: captureResult.scheduledTime ?? undefined,
          deadline: captureResult.deadline ?? undefined,
          recurrenceRule: captureResult.recurrenceRule ?? undefined,
        });

        processedCount += 1;

        if (captureResult.needsAiClassification) {
          scheduleAiClassification(task.id, task.createdAt);
        }

        if (mediaType) {
          scheduleMediaProcessing(task.id, message);
          break;
        }
      } catch (error) {
        if (isTaskIdempotencyError(error)) {
          processedCount += 1;
          continue;
        }
        throw error;
      }
    }

    if (processedCount === 0) {
      await ctx.reply('❌ Не удалось извлечь содержимое. Добавьте текст после тега.');
      return;
    }

    const ackMessage = processedCount > 1 ? `✓ × ${processedCount}` : '✓';

    await ctx.reply(ackMessage, {
      reply_markup: getMainKeyboard(),
      reply_to_message_id: message.message_id
    });

  } catch (error) {
    console.error('[Bot] Message processing error:', error);
    await ctx.reply('❌ Не удалось сохранить. Попробуйте ещё раз.', {
      reply_markup: getMainKeyboard()
    });
  }
}

async function handleMediaGroupMessage(
  ctx: Context,
  message: Message,
  userId: number,
  mediaGroupId: string
): Promise<void> {
  const existing = mediaGroupBuffer.get(mediaGroupId);

  if (existing) {
    existing.messages.push(message);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(
      () => processMediaGroup(mediaGroupId),
      MEDIA_GROUP_DEBOUNCE_MS
    );
  } else {
    const timer = setTimeout(
      () => processMediaGroup(mediaGroupId),
      MEDIA_GROUP_DEBOUNCE_MS
    );

    mediaGroupBuffer.set(mediaGroupId, {
      messages: [message],
      timer,
      userId,
      ctx
    });

    await ctx.reply('📎 Альбом получен...');
  }
}

async function processMediaGroup(mediaGroupId: string): Promise<void> {
  const group = mediaGroupBuffer.get(mediaGroupId);
  if (!group) return;

  mediaGroupBuffer.delete(mediaGroupId);

  const { messages, userId, ctx } = group;

  try {
    const caption = messages.find(m => m.caption)?.caption || '';
    const folderAliases = getUserFolderAliases(userId);
    const user = getUser(userId);
    const timezone = user?.timezone || 'UTC';
    
    const captureResult = captureMessage(caption, {
      hasMedia: true,
      mediaType: 'photo',
      folderAliases,
      timezone,
    });

    const content = captureResult.content || `Альбом (${messages.length} фото)`;

    const task = createTask({
      userId,
      content,
      type: captureResult.type,
      status: captureResult.status,
      folder: captureResult.folder,
      source: 'bot',
      telegramMessageId: messages[0].message_id,
      scheduledDate: captureResult.scheduledDate ?? undefined,
      scheduledTime: captureResult.scheduledTime ?? undefined,
      deadline: captureResult.deadline ?? undefined,
      recurrenceRule: captureResult.recurrenceRule ?? undefined,
    });

    for (const msg of messages) {
      try {
        await processMediaMessage(task.id, msg);
      } catch (err) {
        console.error(`[Bot] Failed to process album media:`, err);
      }
    }

    await ctx.reply('✓', {
      reply_markup: getMainKeyboard()
    });

    console.log(`[Bot] Created album task ${task.id} with ${messages.length} photos`);

  } catch (error) {
    console.error('[Bot] Album processing error:', error);
    await ctx.reply('❌ Не удалось сохранить альбом. Попробуйте ещё раз.', {
      reply_markup: getMainKeyboard()
    });
  }
}

export async function handleEditedMessage(ctx: Context): Promise<void> {
  const message = ctx.editedMessage;
  if (!message) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  const telegramMessageId = message.message_id;
  const task = findTaskByTelegramMessageId(userId, telegramMessageId);
  
  if (!task) {
    return;
  }

  const newText = message.text || message.caption || '';
  if (!newText.trim()) {
    return;
  }

  const user = getUser(userId);
  const timezone = user?.timezone || 'UTC';

  const captureResult = captureMessage(newText, {
    hasMedia: !!getMediaType(message),
    mediaType: getMediaType(message),
    folderAliases: getUserFolderAliases(userId),
    timezone,
  });

  const updated = updateTask(task.id, {
    content: captureResult.content,
    folder: captureResult.folder,
    lastInteractionAt: Date.now(),
    scheduledDate: captureResult.scheduledDate,
    scheduledTime: captureResult.scheduledTime,
    deadline: captureResult.deadline,
    recurrenceRule: captureResult.recurrenceRule,
    status: captureResult.status,
  });

  if (captureResult.needsAiClassification && !captureResult.hasExplicitTag && updated) {
    scheduleAiClassification(task.id, updated.updatedAt);
  }
}

function scheduleAiClassification(taskId: string, originalCreatedAt: number): void {
  import('../../lib/ai').then(({ classifyTaskAsync }) => {
    classifyTaskAsync(taskId, originalCreatedAt).catch(err => {
      console.error('[Bot] AI classification error:', err);
    });
  });
}

function scheduleMediaProcessing(taskId: string, message: Message): void {
  processMediaMessage(taskId, message).catch(err => {
    console.error('[Bot] Media processing error:', err);
  });
}
