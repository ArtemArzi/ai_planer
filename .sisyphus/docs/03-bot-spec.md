# LAZY FLOW: Telegram Bot Specification v1.0

> **AI-Ready Specification** - Designed for implementation by Claude/GPT agents
> **Target Stack**: grammY + Bun + TypeScript

---

## 1. SYSTEM OVERVIEW

### 1.1 Bot Purpose
The Telegram Bot serves as the **primary capture interface** for LAZY FLOW:
- Instant task creation via messages
- Tag-based folder assignment
- AI classification fallback
- Quick actions via Reply Keyboard
- Morning digest notifications
- Deadline reminders

### 1.2 Architecture

```
[User Message] → [grammY Bot] → [Message Handler]
                                       ↓
                           ┌───────────┴───────────┐
                           ↓                       ↓
                    [Tag Detection]         [Media Detection]
                           ↓                       ↓
                    [AI Classification]    [File Processing]
                           ↓                       ↓
                    [Create Task] ←───────────────┘
                           ↓
                    [Reply: ✓]
```

### 1.3 Technical Stack

| Component | Technology |
|-----------|------------|
| Bot Framework | grammY v1.x |
| Runtime | Bun |
| Language | TypeScript |
| Webhook | Hono route |
| Long Polling | grammY built-in |

---

## 2. BOT SETUP

### 2.1 Bot Configuration

```typescript
// src/bot/index.ts
import { Bot, Context, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';

// Custom context with session
interface SessionData {
  onboardingStep?: number;
  lastTaskId?: string;
}

type MyContext = Context & {
  session: SessionData;
};

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// Session middleware
bot.use(session({
  initial: (): SessionData => ({})
}));

// Conversations for onboarding
bot.use(conversations());
bot.use(createConversation(onboardingConversation));
```

### 2.2 Webhook vs Long Polling

```typescript
// src/bot/setup.ts
import { webhookCallback } from 'grammy';

export function setupBot(app: Hono) {
  if (process.env.NODE_ENV === 'production') {
    // Webhook mode
    const secretPath = process.env.WEBHOOK_SECRET;
    
    app.post(`/webhook/${secretPath}`, async (c) => {
      return webhookCallback(bot, 'hono')(c);
    });
    
    // Set webhook on startup
    await bot.api.setWebhook(`${process.env.APP_URL}/webhook/${secretPath}`);
    
  } else {
    // Long polling for development
    bot.start({
      onStart: () => console.log('Bot started in polling mode')
    });
  }
}
```

### 2.3 Bot Commands Registration

```typescript
// Register commands with BotFather
await bot.api.setMyCommands([
  { command: 'start', description: 'Начать работу с ботом' },
  { command: 'help', description: 'Справка по использованию' }
]);

// Set Menu Button to open Mini App
await bot.api.setChatMenuButton({
  menu_button: {
    type: 'web_app',
    text: 'Открыть',
    web_app: { url: process.env.MINI_APP_URL! }
  }
});
```

---

## 3. REPLY KEYBOARD

### 3.1 Keyboard Layout

```
┌─────────────────────────────────┐
│       📱 Приложение             │  ← Opens Mini App
├────────────────┬────────────────┤
│  🎯 Сегодня    │   📥 Inbox     │  ← Quick views
├────────────────┴────────────────┤
│          ❓ Помощь              │  ← Help
└─────────────────────────────────┘
```

### 3.2 Keyboard Implementation

```typescript
// src/bot/keyboards.ts
import { Keyboard } from 'grammy';

export const mainKeyboard = new Keyboard()
  .webApp('📱 Приложение', process.env.MINI_APP_URL!)
  .row()
  .text('🎯 Сегодня').text('📥 Inbox')
  .row()
  .text('❓ Помощь')
  .resized()
  .persistent();

// Send keyboard with any message
await ctx.reply('Готово!', {
  reply_markup: mainKeyboard
});
```

### 3.3 Button Handlers

```typescript
// src/bot/handlers/keyboard.ts

// 🎯 Сегодня - Show today's tasks with checkboxes
bot.hears('🎯 Сегодня', async (ctx) => {
  const userId = ctx.from!.id;
  const tasks = await db.getTasks({ userId, status: 'active' });
  
  if (tasks.length === 0) {
    await ctx.reply('🎯 На сегодня задач нет!\n\nОтправьте сообщение, чтобы создать задачу.');
    return;
  }
  
  // ⚠️ TELEGRAM LIMIT: Messages must be <= 4096 characters
  const MAX_MESSAGE_LENGTH = 4096;
  const MAX_TASK_PREVIEW = 100;
  
  // Build message with tasks (respecting length limit)
  let message = `🎯 *Сегодня* (${tasks.length})\n\n`;
  let tasksShown = 0;
  
  for (const task of tasks.slice(0, 20)) { // Max 20 tasks shown
    const deadlineStr = task.deadline 
      ? ` · ${formatDeadline(task.deadline)}`
      : '';
    
    // Truncate long content
    const content = task.content.length > MAX_TASK_PREVIEW 
      ? task.content.slice(0, MAX_TASK_PREVIEW) + '...'
      : task.content;
    
    const taskLine = `${tasksShown + 1}. ${content}${deadlineStr}\n`;
    
    // Check if adding this line would exceed limit
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
  
  // Inline keyboard with checkboxes (max 5)
  const keyboard = new InlineKeyboard();
  tasks.slice(0, 5).forEach((task, i) => {
    keyboard.text(`✅ ${i + 1}`, `complete:${task.id}`).row();
  });
  
  if (tasks.length > 5) {
    keyboard.webApp('Показать все', process.env.MINI_APP_URL!);
  }
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// 📥 Inbox - Show count and link to app
bot.hears('📥 Inbox', async (ctx) => {
  const userId = ctx.from!.id;
  const count = await db.countTasks(userId, 'inbox');
  
  if (count === 0) {
    await ctx.reply('📥 Inbox пуст!\n\n✨ Все задачи разобраны.');
    return;
  }
  
  const keyboard = new InlineKeyboard()
    .webApp('Разобрать в приложении', process.env.MINI_APP_URL!);
  
  await ctx.reply(
    `📥 *Inbox*: ${count} ${pluralize(count, 'задача', 'задачи', 'задач')}\n\nОткройте приложение, чтобы разобрать.`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// ❓ Помощь - Show help
bot.hears('❓ Помощь', async (ctx) => {
  await sendHelp(ctx);
});
```

---

## 4. COMMANDS

### 4.1 /start - Onboarding

```typescript
// src/bot/handlers/start.ts
// ⚠️ UX FIX: Simplified to 1 step - "lazy" philosophy = minimal onboarding

bot.command('start', async (ctx) => {
  // Create user if not exists
  await db.upsertUser({
    telegramId: ctx.from!.id,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name
  });
  
  // Single welcome message - no multi-step flow
  await ctx.reply(
    `👋 *Привет!*\n\n` +
    `Я — твой ленивый помощник по задачам.\n\n` +
    `📤 *Просто напиши мне* — я сохраню как задачу.\n` +
    `📱 *Открой приложение* — чтобы разобрать и спланировать.\n\n` +
    `_Всё. Можно начинать. Напиши что-нибудь!_`,
    { 
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    }
  );
});
```

### 4.2 /help - Help Text

```typescript
// src/bot/handlers/help.ts

async function sendHelp(ctx: Context) {
  await ctx.reply(
    `📖 *Справка LAZY FLOW*\n\n` +
    `*Как добавить задачу:*\n` +
    `Просто отправь сообщение — я сохраню его.\n\n` +
    `*Теги для быстрой сортировки:*\n` +
    `• \`#w\` — 💼 Работа\n` +
    `• \`#p\` — 🏠 Личное\n` +
    `• \`#i\` — 💡 Идеи\n\n` +
    `*Медиа:*\n` +
    `📷 Фото, 📄 документы, 🎤 голосовые — всё сохраняется.\n\n` +
    `*Кнопки внизу:*\n` +
    `• 📱 Приложение — открыть Mini App\n` +
    `• 🎯 Сегодня — задачи на сегодня\n` +
    `• 📥 Inbox — входящие задачи\n\n` +
    `_Удачного дня!_ ✨`,
    { parse_mode: 'Markdown', reply_markup: mainKeyboard }
  );
}

bot.command('help', sendHelp);
```

### 4.3 /delete_me - User Data Deletion

```typescript
// src/bot/handlers/delete.ts

bot.command('delete_me', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('❌ Да, удалить всё', 'delete_confirm')
    .text('Отмена', 'delete_cancel');
  
  await ctx.reply(
    `⚠️ *Удаление аккаунта*\n\n` +
    `Это удалит:\n` +
    `• Все задачи и заметки\n` +
    `• Все файлы и медиа\n` +
    `• Google Calendar связь\n` +
    `• Все настройки\n\n` +
    `_Действие необратимо!_`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

bot.callbackQuery('delete_confirm', async (ctx) => {
  const userId = ctx.from!.id;
  
  try {
    // 1. Revoke Google tokens if present
    const user = await db.getUser(userId);
    if (user?.googleRefreshToken) {
      await revokeGoogleToken(user.googleRefreshToken).catch(() => {});
    }
    
    // 2. Delete user files
    await fs.rm(`./uploads/${userId}`, { recursive: true, force: true });
    
    // 3. Delete from DB (CASCADE handles tasks, media)
    await db.query('DELETE FROM users WHERE telegram_id = ?', [userId]);
    
    await ctx.editMessageText(
      '✅ *Все данные удалены*\n\n' +
      'Спасибо, что пользовались LAZY FLOW!\n' +
      'Если захотите вернуться — отправьте /start',
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Delete user failed:', error);
    await ctx.editMessageText('❌ Ошибка при удалении. Попробуйте позже.');
  }
});

bot.callbackQuery('delete_cancel', async (ctx) => {
  await ctx.editMessageText('👍 Отменено. Ваши данные в безопасности.');
});
```

---

## 5. MESSAGE CAPTURE

### 5.1 Main Message Handler

> **⚠️ IMPORTANT GUARDS**:
> 1. Only work in private chats (ignore groups)
> 2. Handle media groups (albums) as single task
> 3. Ignore unsupported message types

```typescript
// src/bot/handlers/message.ts

// === MEDIA GROUP BUFFER ===
// When user sends album (multiple photos), Telegram sends each as separate message
// with same media_group_id. We buffer them and create ONE task.
const mediaGroupBuffer = new Map<string, {
  messages: Message[];
  timer: NodeJS.Timeout;
  userId: number;
}>();

const MEDIA_GROUP_DEBOUNCE_MS = 500;

bot.on('message', async (ctx) => {
  const message = ctx.message;
  const userId = ctx.from!.id;
  
  // ⚠️ SECURITY: Only work in private chats!
  // Ignore group/supergroup/channel messages
  if (ctx.chat.type !== 'private') {
    // Silently ignore - don't spam group chats
    return;
  }
  
  // Handle media groups (albums) specially
  const mediaGroupId = message.media_group_id;
  if (mediaGroupId) {
    await handleMediaGroupMessage(ctx, message, userId, mediaGroupId);
    return;
  }
  
  // Ignore unsupported message types
  const unsupportedTypes = ['sticker', 'animation', 'video_note', 'poll', 
                            'location', 'venue', 'contact', 'dice', 'game'];
  for (const type of unsupportedTypes) {
    if (type in message) {
      await ctx.reply('❌ Этот тип сообщения не поддерживается. Отправьте текст, фото, документ или голосовое.');
      return;
    }
  }
  
  // Ignore keyboard button texts (handled separately)
  const keyboardTexts = ['🎯 Сегодня', '📥 Inbox', '❓ Помощь', '📱 Приложение'];
  if (message.text && keyboardTexts.includes(message.text)) {
    return; // Already handled by hears()
  }
  
  try {
    // Process message
    const result = await processMessage(message, userId);
    
    // Reply with checkmark
    await ctx.reply('✓', { 
      reply_markup: mainKeyboard,
      reply_to_message_id: message.message_id
    });
    
    // Trigger async processing
    if (result.needsAiClassification) {
      classifyTaskAsync(result.taskId);
    }
    
    if (result.mediaType) {
      processMediaAsync(result.taskId, message);
    }
    
  } catch (error) {
    console.error('Message processing error:', error);
    
    // ⚠️ CRITICAL: NEVER confirm success on failure!
    // User must know their task was NOT saved
    await ctx.reply('❌ Не удалось сохранить. Попробуйте ещё раз.', {
      reply_markup: mainKeyboard
    });
  }
});

// === MEDIA GROUP (ALBUM) HANDLER ===
// Buffers messages with same media_group_id, creates single task after debounce
async function handleMediaGroupMessage(
  ctx: Context,
  message: Message,
  userId: number,
  mediaGroupId: string
): Promise<void> {
  const existing = mediaGroupBuffer.get(mediaGroupId);
  
  if (existing) {
    // Add to existing buffer
    existing.messages.push(message);
    // Reset timer
    clearTimeout(existing.timer);
    existing.timer = setTimeout(
      () => processMediaGroup(mediaGroupId),
      MEDIA_GROUP_DEBOUNCE_MS
    );
  } else {
    // Create new buffer
    const timer = setTimeout(
      () => processMediaGroup(mediaGroupId),
      MEDIA_GROUP_DEBOUNCE_MS
    );
    
    mediaGroupBuffer.set(mediaGroupId, {
      messages: [message],
      timer,
      userId
    });
  }
  
  // Reply immediately only for first message in group
  if (!existing) {
    await ctx.reply('📎 Альбом получен...');
  }
}

async function processMediaGroup(mediaGroupId: string): Promise<void> {
  const group = mediaGroupBuffer.get(mediaGroupId);
  if (!group) return;
  
  mediaGroupBuffer.delete(mediaGroupId);
  
  const { messages, userId } = group;
  
  // Get caption from first message with caption
  const caption = messages.find(m => m.caption)?.caption || '';
  
  // Create single task for the album
  const task = await db.createTask({
    userId,
    content: caption || `Альбом (${messages.length} фото)`,
    folder: 'media',
    type: 'task',
    status: 'inbox',
    source: 'bot',
    telegramMessageId: messages[0].message_id
  });
  
  // Process all photos in album
  for (const msg of messages) {
    if (msg.photo) {
      await processPhotoMedia(task.id, userId, msg.photo);
    }
  }
  
  console.log(`[MediaGroup] Created task ${task.id} with ${messages.length} photos`);
}
```

### 5.2 Message Processing Logic

```typescript
// src/bot/capture.ts

interface ProcessResult {
  taskId: string;
  folder: string;
  needsAiClassification: boolean;
  mediaType?: 'photo' | 'document' | 'voice' | 'link';
}

async function processMessage(message: Message, userId: number): Promise<ProcessResult> {
  const text = message.text || message.caption || '';
  
  // ⚠️ VALIDATION: Reject empty content (after trimming)
  // Media-only messages will have content set to 'Media attachment' later
  const trimmedText = text.trim();
  if (!trimmedText && !message.photo && !message.document && !message.voice) {
    throw new Error('Empty content');
  }
  
  // 1. Tag detection (first word) — HIGHEST PRIORITY
  const tagMatch = text.match(/^#([wpi])\b/i);
  
  let folder: string;
  let content: string;
  let needsAiClassification = false;
  let hasExplicitTag = false;  // Track if user set tag explicitly
  
  if (tagMatch) {
    // Known tag — user explicitly chose folder
    const tagMap: Record<string, string> = {
      'w': 'work',
      'p': 'personal',
      'i': 'ideas'
    };
    folder = tagMap[tagMatch[1].toLowerCase()];
    content = text.replace(/^#[wpi]\s*/i, '').trim();
    hasExplicitTag = true;  // Tag should NOT be overridden by media!
    
  } else if (text.match(/^#\w+/)) {
    // Unknown tag (like #x) - ignore tag, let AI classify
    folder = 'personal'; // Default, AI will update
    content = text.replace(/^#\w+\s*/, '').trim();
    needsAiClassification = true;
    
  } else {
    // No tag - AI classification
    folder = 'personal'; // Default
    content = text.trim();
    needsAiClassification = true;
  }
  
  // 2. Media/Link detection
  // CRITICAL: Only override folder if NO explicit tag was set!
  let mediaType: 'photo' | 'document' | 'voice' | 'link' | undefined;
  
  if (message.photo) {
    mediaType = 'photo';
    if (!hasExplicitTag) {
      folder = 'media';
      needsAiClassification = false;
    }
  } else if (message.document) {
    mediaType = 'document';
    if (!hasExplicitTag) {
      folder = 'media';
      needsAiClassification = false;
    }
  } else if (message.voice) {
    mediaType = 'voice';
    if (!hasExplicitTag) {
      folder = 'media';
      needsAiClassification = false;
    }
    // NOTE: Voice transcription is handled by media processing queue
    // See Backend Spec section 7.2 for queue system with rate limiting and retries
  } else if (content.match(/https?:\/\/[^\s]+/)) {
    mediaType = 'link';
    if (!hasExplicitTag) {
      folder = 'media';
      needsAiClassification = false;
    }
  }
  
  // 3. Determine type (task vs note) — based on content length ONLY
  // Type affects display, NOT folder (tag wins for folder)
  const type = content.length > 500 ? 'note' : 'task';
  
  // 4. Folder override rules:
  // - If explicit tag was set → tag folder wins (even for notes!)
  // - If type='note' AND no explicit tag → notes folder
  // - This allows "#w [long text]" = type='note' in 'work' folder
  if (type === 'note' && !hasExplicitTag) {
    folder = 'notes';
    needsAiClassification = false;
  }
  
  // 5. Create task/note
  // Notes bypass inbox ONLY if they go to notes folder
  const status = (type === 'note' && folder === 'notes') ? 'active' : 'inbox';
  
  const task = await db.createTask({
    userId,
    content: content || 'Media attachment',
    folder,
    type,
    status,
    source: 'bot',
    telegramMessageId: message.message_id
  });
  
  return {
    taskId: task.id,
    folder,
    needsAiClassification,
    mediaType
  };
}
```

### 5.3 Message Edit Sync

```typescript
// src/bot/handlers/edit.ts

bot.on('edited_message', async (ctx) => {
  const message = ctx.editedMessage!;
  const userId = ctx.from!.id;
  
  // Find task by telegram_message_id
  const task = await db.findTaskByTelegramMessageId(userId, message.message_id);
  
  if (task) {
    const newContent = message.text || message.caption || '';
    
    // Update task content
    await db.updateTask(task.id, {
      content: newContent.replace(/^#[wpi]\s*/i, '').trim(),
      updatedAt: Date.now()
    });
    
    // Re-classify if needed (content changed significantly)
    if (!newContent.match(/^#[wpi]/i)) {
      classifyTaskAsync(task.id);
    }
  }
});
```

---

## 6. INLINE KEYBOARDS

### 6.1 Task Completion

```typescript
// src/bot/handlers/callbacks.ts

// Handle completion callback
bot.callbackQuery(/^complete:(.+)$/, async (ctx) => {
  const taskId = ctx.match![1];
  
  // Update task status
  await db.updateTask(taskId, {
    status: 'done',
    completedAt: Date.now()
  });
  
  // Update message to show completed
  await ctx.answerCallbackQuery({ text: '✅ Выполнено!' });
  
  // Refresh the task list
  await refreshTodayMessage(ctx);
});

// Refresh today's task list after completion
async function refreshTodayMessage(ctx: Context) {
  const userId = ctx.from!.id;
  const tasks = await db.getTasks({ userId, status: 'active' });
  
  if (tasks.length === 0) {
    await ctx.editMessageText('🎯 *Сегодня*\n\n✨ Все задачи выполнены!', {
      parse_mode: 'Markdown'
    });
    return;
  }
  
  let message = `🎯 *Сегодня* (${tasks.length})\n\n`;
  tasks.forEach((task, i) => {
    const deadlineStr = task.deadline 
      ? ` · ${formatDeadline(task.deadline)}`
      : '';
    message += `${i + 1}. ${task.content}${deadlineStr}\n`;
  });
  
  const keyboard = new InlineKeyboard();
  tasks.slice(0, 5).forEach((task, i) => {
    keyboard.text(`✅ ${i + 1}`, `complete:${task.id}`).row();
  });
  
  if (tasks.length > 5) {
    keyboard.webApp('Показать все', process.env.MINI_APP_URL!);
  }
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}
```

### 6.2 Onboarding Callbacks

```typescript
// Handled in conversation (see section 4.1)
bot.callbackQuery(/^onboarding:\d+$/, async (ctx) => {
  // Conversation handles this
  await ctx.answerCallbackQuery();
});
```

---

## 7. NOTIFICATIONS

### 7.1 Morning Digest

```typescript
// src/bot/notifications/digest.ts

async function sendMorningDigest(user: User): Promise<void> {
  const activeCount = await db.countTasks(user.telegramId, 'active');
  const inboxCount = await db.countTasks(user.telegramId, 'inbox');
  
  if (activeCount === 0 && inboxCount === 0) {
    // Nothing to report
    return;
  }
  
  // Get today's tasks
  const todayTasks = await db.getTasks({ 
    userId: user.telegramId, 
    status: 'active' 
  });
  
  // ⚠️ TELEGRAM LIMIT: Messages must be <= 4096 characters
  const MAX_MESSAGE_LENGTH = 4096;
  const MAX_TASK_PREVIEW = 100; // Truncate long task content
  
  // Build message
  let message = `☀️ *Доброе утро!*\n\n`;
  
  if (todayTasks.length > 0) {
    message += `🎯 *Сегодня* (${todayTasks.length}):\n`;
    
    // Show tasks, but respect message limit
    let tasksShown = 0;
    for (const task of todayTasks.slice(0, 10)) { // Max 10 in digest
      const deadlineStr = task.deadline 
        ? ` · ${formatDeadline(task.deadline)}`
        : '';
      
      // Truncate long content
      const content = task.content.length > MAX_TASK_PREVIEW 
        ? task.content.slice(0, MAX_TASK_PREVIEW) + '...'
        : task.content;
      
      const taskLine = `${tasksShown + 1}. ${content}${deadlineStr}\n`;
      
      // Check if adding this line would exceed limit
      if (message.length + taskLine.length + 100 > MAX_MESSAGE_LENGTH) {
        message += `_...и ещё ${todayTasks.length - tasksShown}_\n`;
        break;
      }
      
      message += taskLine;
      tasksShown++;
    }
    
    if (tasksShown < todayTasks.length && !message.includes('...и ещё')) {
      message += `_...и ещё ${todayTasks.length - tasksShown}_\n`;
    }
    message += '\n';
  }
  
  if (inboxCount > 0) {
    message += `📥 *Inbox*: ${inboxCount} ${pluralize(inboxCount, 'задача', 'задачи', 'задач')} ждут разбора\n`;
  }
  
  // Inline keyboard with actions
  const keyboard = new InlineKeyboard();
  
  // Add checkboxes for first 5 tasks
  if (todayTasks.length > 0) {
    todayTasks.slice(0, 5).forEach((task, i) => {
      keyboard.text(`✅ ${i + 1}`, `complete:${task.id}`);
      if ((i + 1) % 3 === 0) keyboard.row();
    });
    keyboard.row();
  }
  
  keyboard.webApp('Открыть приложение', process.env.MINI_APP_URL!);
  
  // ⚠️ ERROR HANDLING: Wrap in try-catch for bot-blocked users
  try {
    await bot.api.sendMessage(user.telegramId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    if (isBotBlockedError(error)) {
      // User blocked the bot - disable their notifications
      await db.updateUser(user.telegramId, { notificationsEnabled: 0 });
      console.log(`[Digest] User ${user.telegramId} blocked bot, notifications disabled`);
    } else {
      // Other error - log but don't break cron
      console.error(`[Digest] Failed to send to ${user.telegramId}:`, error);
    }
  }
}

// Utility function to detect bot-blocked errors
function isBotBlockedError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'description' in error) {
    const desc = (error as { description: string }).description;
    return desc.includes('bot was blocked') || 
           desc.includes('user is deactivated') ||
           desc.includes('chat not found');
  }
  return false;
}
```

### 7.2 Deadline Reminder

```typescript
// src/bot/notifications/deadline.ts

async function sendDeadlineReminder(user: User, task: Task): Promise<void> {
  const timeUntil = task.deadline! - Date.now();
  const minutesUntil = Math.round(timeUntil / 60000);
  
  let timeStr: string;
  if (minutesUntil <= 15) {
    timeStr = 'через 15 минут';
  } else if (minutesUntil <= 60) {
    timeStr = 'через час';
  } else {
    timeStr = formatDeadline(task.deadline!);
  }
  
  const keyboard = new InlineKeyboard()
    .text('✅ Готово', `complete:${task.id}`)
    .webApp('Открыть', process.env.MINI_APP_URL!);
  
  await bot.api.sendMessage(
    user.telegramId,
    `⏰ *Напоминание*\n\n${task.content}\n\n_${timeStr}_`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}
```

### 7.3 Stories Reminder (Tue/Fri)

```typescript
// src/bot/notifications/stories.ts

async function sendStoriesReminder(user: User): Promise<void> {
  const ideasCount = await db.countTasks(user.telegramId, 'ideas');
  
  if (ideasCount === 0) return;
  
  const keyboard = new InlineKeyboard()
    .webApp('Посмотреть идеи 💡', process.env.MINI_APP_URL!);
  
  await bot.api.sendMessage(
    user.telegramId,
    `💡 *Время вдохновения!*\n\n` +
    `У вас ${ideasCount} ${pluralize(ideasCount, 'идея', 'идеи', 'идей')} в архиве.\n\n` +
    `_Может, пора что-то воплотить?_`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}
```

---

## 8. ERROR HANDLING

### 8.1 Error Middleware

```typescript
// src/bot/middleware/error.ts

bot.catch((err) => {
  const ctx = err.ctx;
  console.error('Bot error:', err.error);
  
  // Don't send error messages to user
  // Just log and continue
  
  // If it's a critical error, alert admin
  if (isCriticalError(err.error)) {
    notifyAdmin(`Bot error: ${err.error.message}`);
  }
});
```

### 8.2 Rate Limiting

```typescript
// src/bot/middleware/rateLimit.ts

const userRateLimits = new Map<number, { requests: number[]; warned: boolean }>();

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  
  const now = Date.now();
  const userData = userRateLimits.get(userId) || { requests: [], warned: false };
  
  // Clean old requests (older than 1 minute)
  const recentRequests = userData.requests.filter(t => now - t < 60000);
  
  if (recentRequests.length >= 30) {
    // ⚠️ Rate limited - notify user ONCE per window, then silence
    if (!userData.warned) {
      await ctx.reply('⏳ Слишком много сообщений. Подождите 30 секунд.');
      userData.warned = true;
      userRateLimits.set(userId, { requests: recentRequests, warned: true });
    }
    console.log(`Rate limited user ${userId}`);
    return;
  }
  
  // Reset warning flag if user slowed down
  if (recentRequests.length < 20) {
    userData.warned = false;
  }
  
  recentRequests.push(now);
  userRateLimits.set(userId, { requests: recentRequests, warned: userData.warned });
  
  return next();
});
```

---

## 9. UTILITY FUNCTIONS

### 9.1 Pluralization

```typescript
// src/utils/pluralize.ts

export function pluralize(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  }
  return many;
}

// Usage: pluralize(5, 'задача', 'задачи', 'задач') → 'задач'
```

### 9.2 Markdown Escape (CRITICAL)

> **⚠️ User-generated content can break Telegram Markdown formatting!**
> Characters like `_`, `*`, `[`, `]`, `(`, `)`, `` ` `` must be escaped.

```typescript
// src/utils/escapeMarkdown.ts

// For Markdown (legacy mode)
export function escapeMarkdown(text: string): string {
  return text
    .replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// For MarkdownV2 (recommended - more precise)
export function escapeMarkdownV2(text: string): string {
  return text
    .replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Usage in message building:
function buildTaskListMessage(tasks: Task[]): string {
  let message = `🎯 *Сегодня* (${tasks.length})\n\n`;
  
  tasks.forEach((task, i) => {
    // ⚠️ ESCAPE user content before inserting into Markdown!
    const safeContent = escapeMarkdown(task.content);
    message += `${i + 1}. ${safeContent}\n`;
  });
  
  return message;
}
```

**Rule**: Always call `escapeMarkdown()` on any user-generated string before inserting into Markdown message templates.

---

### 9.3 Deadline Formatting

```typescript
// src/utils/formatDeadline.ts

export function formatDeadline(timestamp: number): string {
  const now = new Date();
  const deadline = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  
  if (deadline < now) {
    return '⚠️ Просрочено';
  }
  
  if (deadline < tomorrow) {
    return `Сегодня, ${formatTime(deadline)}`;
  }
  
  if (deadline < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
    return `Завтра, ${formatTime(deadline)}`;
  }
  
  return `${formatDate(deadline)}, ${formatTime(deadline)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
```

---

## 10. COMPLETE BOT SETUP

### 10.1 Main Bot File

```typescript
// src/bot/index.ts
import { Bot, session, GrammyError, HttpError } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { mainKeyboard } from './keyboards';
import { onboardingConversation } from './handlers/start';
import { setupMessageHandlers } from './handlers/message';
import { setupCallbackHandlers } from './handlers/callbacks';
import { setupKeyboardHandlers } from './handlers/keyboard';

export function createBot() {
  const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
  
  // Session
  bot.use(session({ initial: () => ({}) }));
  
  // Conversations
  bot.use(conversations());
  bot.use(createConversation(onboardingConversation, 'onboarding'));
  
  // Rate limiting
  bot.use(rateLimitMiddleware);
  
  // Commands
  bot.command('start', (ctx) => ctx.conversation.enter('onboarding'));
  bot.command('help', sendHelp);
  
  // Keyboard handlers
  setupKeyboardHandlers(bot);
  
  // Callback handlers
  setupCallbackHandlers(bot);
  
  // Message handlers (must be last)
  setupMessageHandlers(bot);
  
  // Error handling with bot blocked detection
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    
    if (err.error instanceof GrammyError) {
      // Handle "bot was blocked by user"
      if (err.error.description.includes('bot was blocked')) {
        const userId = ctx.from?.id;
        if (userId) {
          // Disable notifications for this user
          db.updateUser(userId, { notificationsEnabled: 0 });
          console.log(`[Bot] User ${userId} blocked bot, notifications disabled`);
        }
        return; // Don't log as error
      }
      
      // Handle "user is deactivated"
      if (err.error.description.includes('user is deactivated')) {
        const userId = ctx.from?.id;
        if (userId) {
          db.updateUser(userId, { notificationsEnabled: 0 });
        }
        return;
      }
      
      console.error('Error in request:', err.error.description);
    } else if (err.error instanceof HttpError) {
      console.error('Could not contact Telegram:', err.error);
    } else {
      console.error('Unknown error:', err.error);
    }
  });
  
  return bot;
}
```

### 10.2 Integration with Hono

```typescript
// src/index.ts
import { Hono } from 'hono';
import { createBot } from './bot';

const app = new Hono();
const bot = createBot();

// Webhook endpoint
app.post('/webhook/:secret', async (c) => {
  const secret = c.req.param('secret');
  if (secret !== process.env.WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }
  return webhookCallback(bot, 'hono')(c);
});

// Start
if (process.env.NODE_ENV === 'development') {
  bot.start();
  console.log('Bot started in polling mode');
}

export default {
  port: 3000,
  fetch: app.fetch
};
```

---

## 11. IMPLEMENTATION CHECKLIST

### Phase 1: Core Bot
- [ ] Bot setup with grammY
- [ ] Webhook/polling configuration
- [ ] Commands registration
- [ ] Main keyboard setup

### Phase 2: Message Capture
- [ ] Text message handler
- [ ] Tag detection (#w/#p/#i)
- [ ] AI classification trigger
- [ ] ✓ reply

### Phase 3: Media Support
- [ ] Photo handling
- [ ] Document handling
- [ ] Voice handling (creates media record, triggers queue)
- [ ] Link detection

> **Note**: Voice transcription is handled by backend media processing queue.
> See `01-backend-spec.md` section 7.2 for queue system with rate limiting and retries.

### Phase 4: Keyboard Handlers
- [ ] 📱 Приложение (WebApp button)
- [ ] 🎯 Сегодня (task list + checkboxes)
- [ ] 📥 Inbox (count + link)
- [ ] ❓ Помощь (help text)

### Phase 5: Inline Actions
- [ ] Task completion callbacks
- [ ] Onboarding callbacks
- [ ] Message refresh after action

### Phase 6: Notifications
- [ ] Morning digest
- [ ] Deadline reminders
- [ ] Stories reminder (Tue/Fri)

### Phase 7: Edge Cases
- [ ] Message edit sync
- [ ] Unknown tag handling
- [ ] Rate limiting
- [ ] Error handling

---

## APPENDIX: Message Flow Diagram

```
User sends "Купить молоко"
        ↓
[grammY receives message]
        ↓
[Check if keyboard button text] → NO
        ↓
[Tag detection] → No tag found
        ↓
[Media detection] → No media
        ↓
[Type detection] → 15 chars = 'task'
        ↓
[Create task: status=inbox, folder=personal]
        ↓
[Reply: ✓]
        ↓
[Async: AI classification]
        ↓
[AI returns: folder='personal', confidence=0.85]
        ↓
[Update task: folder='personal']
```

---

*Generated by Prometheus Planner*
*Version: 1.0*
*Date: 2026-02-05*
