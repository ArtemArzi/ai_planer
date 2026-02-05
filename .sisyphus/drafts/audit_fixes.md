# LAZY FLOW: Logic Audit Fixes

## Решения по результатам аудита

### 1. CAPTURE PRECEDENCE MATRIX (новое)

| Priority | Rule | Result |
|----------|------|--------|
| 1 | **Explicit Tag** (#w, #p, #i) | Tag определяет папку |
| 2 | **Content Length** (>500 chars) | type='note', folder='notes' |
| 3 | **Media Attachment** (photo/doc/voice) | folder='media', но tag может override |
| 4 | **URL Detection** | folder='media', но tag может override |
| 5 | **AI Classification** | Fallback если ничего выше не сработало |

**Пример**: `#w http://example.com` → folder='work', URL прикрепляется как media

---

### 2. NOTE ENTITY (уточнение)

| Aspect | Previous | Fixed |
|--------|----------|-------|
| Sunset | ✅ 30 days → archive | ❌ **Исключены** (как Ideas) |
| Mixer | ✅ Resurfaces | ✅ Без изменений |
| Folder | 'notes' | 'notes' (system, protected) |

**Почему**: Заметки — это справочная информация. Частое чтение без редактирования не должно приводить к архивации.

---

### 3. ZOMBIE COMPLETION FIX

**Проблема**: 2s timer продолжает работать после Undo

**Решение**:
```typescript
// Frontend: TaskRow.tsx
const timerRef = useRef<number | null>(null);

function handleComplete() {
  setIsCompleting(true);
  haptic.notification('success');
  
  // Store for undo
  setPendingUndo({ ... });
  
  // Save timer reference for cancellation
  timerRef.current = window.setTimeout(() => {
    updateTask.mutate({ id: task.id, updates: { status: 'done' } });
  }, 2000);
}

// Cancel timer on Undo
useEffect(() => {
  // If pendingUndo was cleared (by undo action) and we're completing
  if (!pendingUndo && isCompleting && pendingUndo?.taskId === task.id) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsCompleting(false);
  }
}, [pendingUndo]);
```

---

### 4. RACE CONDITION FIX

**Sunset Engine**: Добавить проверку updated_at

```sql
-- Не архивировать задачи, отредактированные за последний час
SELECT id, user_id FROM tasks
WHERE status = 'active'
  AND is_idea = 0
  AND type = 'task'  -- Notes excluded now
  AND deadline IS NULL
  AND last_interaction_at < ?
  AND updated_at < ?  -- ← NEW: не трогать если редактировалось недавно
```

---

### 5. IDEMPOTENCY FIX

**Database**: Добавить unique constraint

```sql
-- Migration
CREATE UNIQUE INDEX idx_tasks_telegram_msg 
ON tasks(user_id, telegram_message_id) 
WHERE telegram_message_id IS NOT NULL;
```

**Bot Handler**: Upsert вместо insert
```typescript
// Before: await db.createTask(...)
// After:
await db.query(`
  INSERT INTO tasks (...)
  VALUES (...)
  ON CONFLICT (user_id, telegram_message_id) 
  DO UPDATE SET content = excluded.content, updated_at = ?
`, [Date.now()]);
```

---

### 6. ORPHANED FILES CLEANUP

**New Cron Job**: Run weekly

```typescript
new Cron('0 4 * * 0', async () => { // Sunday 4 AM
  console.log('[Cleanup] Starting orphaned files cleanup');
  
  // Get all file paths from media table
  const mediaFiles = await db.query('SELECT file_path FROM media');
  const dbPaths = new Set(mediaFiles.map(m => m.file_path));
  
  // Scan uploads directory
  const uploadedFiles = await scanDirectory('./uploads');
  
  // Delete files not in DB
  for (const filePath of uploadedFiles) {
    if (!dbPaths.has(filePath)) {
      await fs.unlink(filePath);
      console.log(`[Cleanup] Deleted orphan: ${filePath}`);
    }
  }
});
```

---

### 7. MIXER ENHANCEMENT

| Previous | Fixed |
|----------|-------|
| 3 tasks/day | **5 tasks/day** |

```typescript
const candidates = await db.query(`
  SELECT * FROM tasks
  WHERE user_id = ?
    AND status = 'backlog'
    AND is_idea = 0
    AND (last_seen_at IS NULL OR last_seen_at < ?)
  ORDER BY RANDOM()
  LIMIT 5  -- ← было 3
`, [userId, fourteenDaysAgo]);
```

---

### 8. INBOX OVERFLOW: BULK ACTION

**UI**: Показать кнопку "Отложить всё" когда Inbox > 10

```tsx
// InboxStack.tsx
{tasks.length > 10 && (
  <motion.button
    onClick={handlePostponeAll}
    className="w-full py-3 bg-yellow-500/20 rounded-xl text-yellow-600 font-medium"
  >
    ⏰ Отложить всё ({tasks.length}) в Backlog
  </motion.button>
)}

async function handlePostponeAll() {
  haptic.impact('heavy');
  
  await batchUpdateTasks.mutate({
    ids: tasks.map(t => t.id),
    updates: { status: 'backlog' }
  });
  
  toast.success(`${tasks.length} задач отложено`);
}
```

**API**: New batch endpoint

```typescript
api.patch('/tasks/batch', authMiddleware, async (c) => {
  const { ids, updates } = await c.req.json();
  const userId = c.get('userId');
  
  // Verify ownership and update
  await db.query(`
    UPDATE tasks 
    SET status = ?, updated_at = ?
    WHERE id IN (${ids.map(() => '?').join(',')})
      AND user_id = ?
  `, [updates.status, Date.now(), ...ids, userId]);
  
  return c.json({ success: true, count: ids.length });
});
```

---

### 9. INBOX TAP = EDIT

**SwipeCard.tsx**: Добавить onTap handler

```tsx
<motion.div
  // ... existing props
  onTap={handleTap}  // ← NEW
>

function handleTap() {
  // Open edit sheet instead of just view
  useUIStore.getState().openTaskEdit(task.id);
}
```

**TaskEditSheet.tsx**: Новый компонент (или расширить TaskDetailSheet)

- Редактирование текста
- Смена папки (picker)
- Установка дедлайна
- Сохранение → задача остаётся в Inbox

---

### 10. GLOBAL SEARCH

**UI**: Search bar в Shelves tab

```tsx
// ShelvesTab.tsx
<div className="p-4">
  <SearchBar 
    placeholder="Поиск задач и заметок..."
    onSearch={handleSearch}
  />
  
  {searchQuery ? (
    <SearchResults query={searchQuery} />
  ) : (
    <FolderList />
  )}
</div>
```

**API**: New search endpoint

```typescript
api.get('/tasks/search', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q');
  
  if (!query || query.length < 2) {
    return c.json([]);
  }
  
  // Simple LIKE search (SQLite FTS5 for better perf later)
  const results = await db.query(`
    SELECT * FROM tasks
    WHERE user_id = ?
      AND content LIKE ?
      AND status NOT IN ('deleted')
    ORDER BY updated_at DESC
    LIMIT 50
  `, [userId, `%${query}%`]);
  
  return c.json(results);
});
```

---

### 11. TRASH AUTO-PURGE

**New Cron Job**:

```typescript
new Cron('0 5 * * *', async () => { // Daily 5 AM
  console.log('[Purge] Starting trash cleanup');
  
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  
  // Get tasks to delete (need file paths)
  const toDelete = await db.query(`
    SELECT t.id, m.file_path FROM tasks t
    LEFT JOIN media m ON m.task_id = t.id
    WHERE t.status = 'deleted'
      AND t.deleted_at < ?
  `, [ninetyDaysAgo]);
  
  // Delete files
  for (const item of toDelete) {
    if (item.file_path) {
      await fs.unlink(item.file_path).catch(() => {});
    }
  }
  
  // Delete from DB
  await db.query(`
    DELETE FROM tasks 
    WHERE status = 'deleted' AND deleted_at < ?
  `, [ninetyDaysAgo]);
  
  console.log(`[Purge] Permanently deleted ${toDelete.length} tasks`);
});
```

---

### 12. USER DATA DELETION

**Bot Command**: /delete_me

```typescript
bot.command('delete_me', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('❌ Да, удалить всё', 'delete_confirm')
    .text('Отмена', 'delete_cancel');
  
  await ctx.reply(
    '⚠️ *Удаление аккаунта*\n\n' +
    'Это удалит:\n' +
    '• Все задачи и заметки\n' +
    '• Все файлы и медиа\n' +
    '• Google Calendar связь\n' +
    '• Все настройки\n\n' +
    '_Действие необратимо!_',
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

bot.callbackQuery('delete_confirm', async (ctx) => {
  const userId = ctx.from!.id;
  
  // 1. Revoke Google tokens
  const user = await db.getUser(userId);
  if (user.googleRefreshToken) {
    await revokeGoogleToken(user.googleRefreshToken);
  }
  
  // 2. Delete files
  await fs.rm(`./uploads/${userId}`, { recursive: true, force: true });
  
  // 3. Delete from DB (cascade handles tasks, media)
  await db.query('DELETE FROM users WHERE telegram_id = ?', [userId]);
  
  await ctx.editMessageText('✅ Все данные удалены. Прощайте!');
});
```

---

### 13. BOT BLOCKED HANDLER

```typescript
bot.catch((err) => {
  const ctx = err.ctx;
  
  if (err.error instanceof GrammyError) {
    // User blocked bot
    if (err.error.description.includes('bot was blocked')) {
      const userId = ctx.from?.id;
      if (userId) {
        // Mark user as inactive (don't send notifications)
        db.updateUser(userId, { notificationsEnabled: 0 });
        console.log(`[Bot] User ${userId} blocked bot, notifications disabled`);
      }
      return; // Don't rethrow
    }
  }
  
  // Other errors
  console.error('Bot error:', err.error);
});
```

---

## Summary: Implementation Checklist

### Critical (before launch)
- [ ] Fix capture precedence (Tag > everything)
- [ ] Exclude Notes from Sunset
- [ ] Fix zombie completion timer
- [ ] Add telegram_message_id unique index
- [ ] Add bot blocked handler

### Important (MVP)
- [ ] Inbox bulk action "Отложить всё"
- [ ] Inbox tap = edit
- [ ] Global search in Shelves
- [ ] Increase Mixer to 5/day
- [ ] Race condition fix (updated_at check)

### Compliance (before public)
- [ ] Trash auto-purge (90 days)
- [ ] /delete_me command
- [ ] Orphaned files cleanup cron

### Nice to have (post-MVP)
- [ ] FTS5 search for better performance
- [ ] Calendar sync conflict resolution

---

## Session 3 Fixes (Feb 5, 2026) - Security Audit

### 19. XSS IN SEARCH HIGHLIGHT

**Проблема**: `dangerouslySetInnerHTML` для подсветки search results → XSS уязвимость

**Решение**: Text-based highlighting без innerHTML

```tsx
// Before (VULNERABLE):
<span dangerouslySetInnerHTML={{ __html: highlightedContent }} />

// After (SAFE):
function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query) return text;
  
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  
  return parts.map((part, i) => 
    part.toLowerCase() === query.toLowerCase() 
      ? <mark key={i} className="bg-yellow-200">{part}</mark>
      : part
  );
}
```

**Файл изменён**: `02-frontend-spec.md` section 4.9

---

### 20. TIMESTAMP MISMATCH

**Проблема**: SQLite `unixepoch()` возвращает секунды, JavaScript `Date.now()` — миллисекунды

**Решение**: Все timestamps используют `unixepoch() * 1000`

```sql
-- ВСЕ поля теперь в миллисекундах:
created_at INTEGER DEFAULT (unixepoch() * 1000),
updated_at INTEGER DEFAULT (unixepoch() * 1000),
last_interaction_at INTEGER DEFAULT (unixepoch() * 1000),
next_attempt_at INTEGER DEFAULT (unixepoch() * 1000)
```

**Файлы изменены**: `01-backend-spec.md` section 2.1, добавлен warning box

---

### 21. AI CLASSIFICATION RACE CONDITION

**Проблема**: AI мог перезаписать папку, которую пользователь уже изменил вручную

**Решение**: Double-check `updatedAt > createdAt` перед применением AI результата

```typescript
// В classifyTaskAsync:
if (task.updatedAt > originalCreatedAt) {
  console.log(`[AI] Skipping: user already modified`);
  return;
}

// Повторная проверка после AI call:
const freshTask = await db.getTask(taskId);
if (freshTask.updatedAt > originalCreatedAt) {
  console.log(`[AI] Aborting: task modified during classification`);
  return;
}
```

**Файл изменён**: `01-backend-spec.md` section 4.2

---

### 22. /ME TOKEN LEAKAGE

**Проблема**: Endpoint `/me` мог вернуть `google_refresh_token` во frontend

**Решение**: DTO с whitelist полей, `hasGoogleCalendar: boolean` вместо токена

```typescript
return c.json({
  // ... safe fields
  hasGoogleCalendar: !!user.google_refresh_token, // Boolean only!
  // NEVER: googleRefreshToken: user.google_refresh_token ❌
});
```

**Файл изменён**: `01-backend-spec.md` section 5.2 GET /me

---

### 23. SSRF IN LINK PREVIEW

**Проблема**: `extractLinkPreview(url)` мог обратиться к internal IP

**Решение**: Whitelist публичных URL, блокировка private IP ranges

```typescript
function isPrivateIP(hostname: string): boolean {
  // Block: 127.*, 10.*, 192.168.*, 172.16-31.*, localhost, etc.
  const privateRanges = [
    /^127\./, /^10\./, /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^169\.254\./,
    /^localhost$/i, /^\[::1\]$/
  ];
  return privateRanges.some(r => r.test(hostname));
}
```

**Файл изменён**: `01-backend-spec.md` (новая секция в 7.x)

---

### 24. /UPLOADS STATIC FILE ACCESS

**Проблема**: Статическая раздача `/uploads` без auth → любой мог получить чужие файлы

**Решение**: Новый endpoint `/files/:mediaId` с auth middleware

```typescript
api.get('/files/:mediaId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const media = await db.getMedia(mediaId);
  
  // Verify ownership
  if (!media || media.userId !== userId) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  return new Response(file.stream(), {
    headers: { 'Cache-Control': 'private, max-age=86400' }
  });
});
```

**Файл изменён**: `01-backend-spec.md` section 5.2

---

### 25. OPTIMISTIC UPDATE TOAST

**Проблема**: При ошибке мутации UI не показывал rollback

**Решение**: `toast.error()` в `onError` callback

```typescript
onError: (error, variables, context) => {
  // Rollback
  queryClient.setQueryData(['tasks'], context.previousTasks);
  
  // ⚠️ SHOW ERROR TO USER!
  toast.error('Не удалось сохранить. Проверьте соединение.');
}
```

**Файл изменён**: `02-frontend-spec.md` section 4.6

---

### 26. GROUP CHAT IGNORE

**Проблема**: Бот мог реагировать на сообщения в группах

**Решение**: Early return для non-private chats

```typescript
if (ctx.chat.type !== 'private') {
  return; // Silently ignore
}
```

**Файл изменён**: `03-bot-spec.md` section 5.1

---

### 27. MEDIA GROUP (ALBUM) HANDLING

**Проблема**: Альбом из 5 фото создавал 5 отдельных задач

**Решение**: Debounce buffer по `media_group_id`

```typescript
const mediaGroupBuffer = new Map<string, {
  messages: Message[];
  timer: NodeJS.Timeout;
}>();

// Буферизуем сообщения с одинаковым media_group_id
// Через 500ms создаём ОДНУ задачу со всеми фото
```

**Файл изменён**: `03-bot-spec.md` section 5.1

---

### 28. CRON ERROR HANDLING

**Проблема**: Если пользователь заблокировал бота, cron падал при отправке уведомления

**Решение**: Try-catch + disable notifications для blocked users

```typescript
try {
  await bot.api.sendMessage(user.telegramId, message);
} catch (error) {
  if (isBotBlockedError(error)) {
    await db.updateUser(user.telegramId, { notificationsEnabled: 0 });
  }
}
```

**Файл изменён**: `03-bot-spec.md` section 7.1

---

### 29. GESTURE CONFLICT (Direction Lock)

**Проблема**: Диагональный свайп на карточке мог триггерить и complete и delete

**Решение**: Direction lock после 30px movement

```typescript
const [lockedDirection, setLockedDirection] = useState<'x' | 'y' | null>(null);

const handleDrag = (event, info) => {
  if (!lockedDirection && (Math.abs(info.offset.x) > 30 || Math.abs(info.offset.y) > 30)) {
    setLockedDirection(Math.abs(info.offset.x) > Math.abs(info.offset.y) ? 'x' : 'y');
  }
};
```

**Файл изменён**: `02-frontend-spec.md` section 4.1

---

### 30. OFFLINE PERSISTENCE

**Проблема**: При закрытии приложения offline cache терялся

**Решение**: `persistQueryClient` с localStorage adapter

```typescript
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'LAZYFLOW_CACHE'
});

persistQueryClient({ queryClient, persister, maxAge: 1000 * 60 * 60 * 24 });
```

**Файл изменён**: `02-frontend-spec.md` section 2.1

---

### 31. UNDO PERSISTENCE

**Проблема**: При закрытии приложения pending undo actions терялись

**Решение**: `beforeunload` + `sendBeacon` для flush

```typescript
window.addEventListener('beforeunload', () => {
  const pendingUndos = useUIStore.getState().pendingUndos;
  
  if (pendingUndos.size > 0) {
    // Commit all pending changes synchronously
    for (const [taskId, action] of pendingUndos) {
      navigator.sendBeacon('/api/tasks/batch', JSON.stringify({
        ids: [taskId],
        updates: { status: 'done' }
      }));
    }
  }
});
```

**Файл изменён**: `02-frontend-spec.md` section 3.1

---

### 32. UNSUPPORTED MESSAGE TYPES

**Проблема**: Стикеры, опросы, геолокация создавали пустые задачи

**Решение**: Explicit reject с информативным сообщением

```typescript
const unsupportedTypes = ['sticker', 'animation', 'video_note', 'poll', 
                          'location', 'venue', 'contact', 'dice', 'game'];
                          
for (const type of unsupportedTypes) {
  if (type in message) {
    await ctx.reply('❌ Этот тип сообщения не поддерживается.');
    return;
  }
}
```

**Файл изменён**: `03-bot-spec.md` section 5.1

---

### 33. GDPR DATA EXPORT

**Решение**: Новый endpoint `GET /export`

```typescript
api.get('/export', authMiddleware, async (c) => {
  const user = await db.getUser(userId);
  const tasks = await db.query('SELECT * FROM tasks WHERE user_id = ?', [userId]);
  
  // Safe export without tokens
  return c.json(exportData, 200, {
    'Content-Disposition': `attachment; filename="lazyflow-export-${userId}.json"`
  });
});
```

**Файл изменён**: `01-backend-spec.md` section 5.2

---

### 34. DoS VOICE DOWNLOAD (Session 3 continuation)

**Проблема**: Rate limit проверялся ПОСЛЕ скачивания файла → DoS через большие файлы

**Решение**: Проверка rate limit ПЕРЕД `bot.api.getFile()`

```typescript
if (message.voice) {
  // ⚠️ Check rate limit BEFORE downloading!
  const recentJobs = await db.query(`
    SELECT COUNT(*) as count FROM media_queue 
    WHERE user_id = ? AND created_at > ?
  `, [userId, Date.now() - 60000]);
  
  if (recentJobs[0].count >= 5) {
    await db.updateTask(task.id, { 
      content: 'Голосовое сообщение (слишком много запросов)' 
    });
    return;
  }
  
  // NOW safe to download
  const file = await bot.api.getFile(voice.file_id);
}
```

**Файл изменён**: `01-backend-spec.md` section 7.1

---

### 35. DEADLINE/EMPTY VALIDATION

**Проблема**: 
- Можно создать задачу с deadline в прошлом
- Пустая строка создавала задачу

**Решение**: Валидация в POST/PATCH /tasks

```typescript
// Deadline validation
if (body.deadline && body.deadline < Date.now()) {
  return c.json({ error: 'Deadline cannot be in the past' }, 400);
}

// Empty content validation
const trimmedContent = body.content.trim();
if (!trimmedContent) {
  return c.json({ error: 'Content cannot be empty' }, 400);
}
```

**Файлы изменены**: `01-backend-spec.md` section 5.2, `03-bot-spec.md` section 5.2

---

### 36. MIXER EXCLUDE NOTES

**Проблема**: Mixer мог вернуть notes из backlog

**Решение**: Добавлено `AND type = 'task'` в SQL запрос Mixer

```sql
SELECT * FROM tasks
WHERE user_id = ?
  AND status = 'backlog'
  AND type = 'task'        -- ← NEW: exclude notes
  AND is_idea = 0
  AND (last_seen_at IS NULL OR last_seen_at < ?)
```

**Файл изменён**: `01-backend-spec.md` section 6.1

---

### 37. MESSAGE LENGTH LIMIT

**Проблема**: Длинные списки задач могли превысить Telegram limit (4096 chars)

**Решение**: Truncation с preview и "...и ещё N"

```typescript
const MAX_MESSAGE_LENGTH = 4096;
const MAX_TASK_PREVIEW = 100;

// При построении сообщения проверяем лимит
if (message.length + taskLine.length + 100 > MAX_MESSAGE_LENGTH) {
  message += `_...и ещё ${remaining}_`;
  break;
}
```

**Файлы изменены**: `03-bot-spec.md` sections 3.3, 7.1

---

## Final Implementation Checklist (after Session 3)

### Critical (before launch) ✅
- [x] Fix capture precedence (Tag > everything)
- [x] Exclude Notes from Sunset
- [x] Fix zombie completion timer
- [x] Add telegram_message_id unique index
- [x] Add bot blocked handler
- [x] XSS protection in search
- [x] SSRF protection in link preview
- [x] Token leakage prevention
- [x] Protected file access

### Important (MVP) ✅
- [x] Inbox bulk action "Отложить всё"
- [x] Global search in Shelves
- [x] Increase Mixer to 5/day
- [x] Race condition fix (updated_at check)
- [x] Undo queue (multiple pending)
- [x] Tag vs Note priority clarified
- [x] AI classification race condition
- [x] Deadline/empty validation
- [x] Message length limits

### Media (MVP) ✅
- [x] Media processing queue table
- [x] Rate limiting (5/user/min)
- [x] Rate limit BEFORE download (DoS fix)
- [x] Retry with exponential backoff
- [x] Fallback on failure
- [x] Transcription complete notification
- [x] Queue cleanup cron

### Compliance (before public) ✅
- [x] Trash auto-purge (90 days)
- [x] /delete_me command
- [x] Orphaned files cleanup cron
- [x] GDPR export endpoint
- [x] Group chat ignore
- [x] Unsupported message types handling

### UX Polish ✅
- [x] Gesture direction lock
- [x] Offline persistence
- [x] Undo persistence
- [x] Optimistic update error toast
- [x] Media group (album) handling
- [x] Timestamp unification (ms everywhere)

---

## Session 4 Fixes (Feb 5, 2026) - Final Comprehensive Audit

### CRITICAL ISSUES

#### 38. BOT ✓ ON ERROR (TRUST FAILURE)

**Проблема**: Bot отвечал `✓` даже когда сохранение task failed → пользователь думает что сохранено

**Решение**: Заменено на error message при ошибке

```typescript
} catch (error) {
  // ⚠️ NEVER confirm success on failure!
  await ctx.reply('❌ Не удалось сохранить. Попробуйте ещё раз.');
}
```

**Файл изменён**: `03-bot-spec.md` section 5.1

---

#### 39. WEBHOOK IDEMPOTENCY

**Проблема**: Telegram retry при timeout → дубликаты задач

**Решение**: Unique index на (user_id, telegram_message_id)

```sql
CREATE UNIQUE INDEX idx_tasks_telegram_idempotency 
  ON tasks(user_id, telegram_message_id) 
  WHERE telegram_message_id IS NOT NULL;
```

**Файл изменён**: `01-backend-spec.md` section 2.2

---

#### 40. OPTIMISTIC LOCKING FOR CONCURRENT EDITS

**Проблема**: Last-write-wins → потеря изменений при редактировании с двух устройств

**Решение**: `expectedUpdatedAt` в PATCH + 409 Conflict response

```typescript
if (updates.expectedUpdatedAt !== undefined) {
  if (task.updatedAt !== updates.expectedUpdatedAt) {
    return c.json({ 
      error: 'Conflict: task was modified', 
      code: 'CONFLICT',
      currentTask: task 
    }, 409);
  }
}
```

**Файл изменён**: `01-backend-spec.md` section 5.2

---

#### 41. CROSS-SPEC DTO ALIGNMENT

**Проблема**: Backend snake_case vs Frontend camelCase; inconsistent field names

**Решение**: Добавлена секция "CROSS-SPEC CONVENTIONS" с обязательными DTO shapes и правилами трансформации

**Файл изменён**: `01-backend-spec.md` (новая секция в начале)

---

### HIGH ISSUES

#### 42. CALENDAR SYNC RETRY + BACKOFF

**Проблема**: Token expiry без retry → silent desync; hammering API при revoked token

**Решение**: 
- Try-catch с retry once на 401
- Clear token и stop sync при repeated failures

**Файл изменён**: `01-backend-spec.md` section 8.1, 8.2

---

#### 43. BATCH ENDPOINT TRANSPARENCY

**Проблема**: Возвращал `success: true` даже при partial failure

**Решение**: Возвращает `updatedIds`, `skippedIds`, реальный `updatedCount`

**Файл изменён**: `01-backend-spec.md` section 5.2

---

#### 44. BOT RATE LIMIT USER FEEDBACK

**Проблема**: Молчаливый игнор при rate limit → пользователь думает бот сломан

**Решение**: Одноразовое уведомление "Слишком много сообщений"

**Файл изменён**: `03-bot-spec.md` section 8.2

---

#### 45. DST-SAFE TIMEZONE LOGIC

**Проблема**: `toLocaleString` hack не safe для DST transitions

**Решение**: Proper timezone offset calculation с `Intl.DateTimeFormat`

**Файл изменён**: `01-backend-spec.md` section 5.2 getUserToday

---

#### 46. MEDIA QUEUE RECOVERY AFTER RESTART

**Проблема**: Server restart → stuck jobs in 'processing' state forever

**Решение**: `recoverStuckJobs()` при startup

**Файл изменён**: `01-backend-spec.md` section 6.5

---

#### 47. BEFOREUNLOAD ONLY COMMIT ELAPSED UNDOS

**Проблема**: При закрытии app коммитились ВСЕ pending actions, даже те что пользователь хотел undo

**Решение**: Коммитить только actions с `actionAge >= 2000ms`

**Файл изменён**: `02-frontend-spec.md` section 3.1

---

#### 48. INBOX LOADING + EMPTY STATES

**Проблема**: Пустой экран при загрузке; нет empty state

**Решение**: Skeleton loader + Empty state с CTA

**Файл изменён**: `02-frontend-spec.md` section 4.4

---

#### 49. SWIPE COACHMARK FOR DISCOVERABILITY

**Проблема**: Swipe actions не discoverable для новых пользователей

**Решение**: One-time coachmark с localStorage flag

**Файл изменён**: `02-frontend-spec.md` section 4.4

---

#### 50. TOUCH TARGETS MIN 44x44

**Проблема**: Checkbox 24x24 — слишком маленький touch target

**Решение**: `min-w-11 min-h-11` wrapper с aria-label

**Файл изменён**: `02-frontend-spec.md` section 4.6

---

#### 51. MARKDOWN ESCAPE IN BOT MESSAGES

**Проблема**: User content с `_*[]` ломает Markdown форматирование

**Решение**: `escapeMarkdown()` utility function

**Файл изменён**: `03-bot-spec.md` (новая секция 9.2)

---

#### 52. UNDO STACK UI (NOT JUST LATEST)

**Проблема**: При multiple pending actions, можно отменить только последнее

**Решение**: "Отменить всё" button когда `pendingCount > 1`

**Файл изменён**: `02-frontend-spec.md` section 4.13

---

## FINAL Implementation Checklist

### Sessions 1-4 Summary: 52 total fixes applied

| Session | Focus | Fixes |
|---------|-------|-------|
| Session 1 | Logic Audit | 13 fixes |
| Session 2 | Media Queue | 5 fixes |
| Session 3 | Security Audit | 19 fixes |
| Session 4 | Final Comprehensive | 15 fixes |

### All CRITICAL + HIGH Issues: ✅ RESOLVED

The specifications are now ready for implementation.

---

## Session 2 Fixes (Feb 5, 2026)

### 14. MEDIA PROCESSING QUEUE

**Проблема**: 10 голосовых сообщений за минуту могут перегрузить Whisper API

**Решение**: Queue с rate limiting, retry, fallback

| Компонент | Значение |
|-----------|----------|
| Rate limit | 5 jobs/user/minute |
| Max retries | 3 attempts |
| Backoff | 1s → 2s → 4s (exponential) |
| Timeout | 30s per job |
| Fallback | "Голосовое сообщение (не удалось расшифровать)" |

**Новые сущности**:

1. **media_queue table** - Персистентная очередь заданий
2. **enqueueTranscription()** - Добавляет job с rate limit check
3. **startMediaQueueProcessor()** - Worker loop (poll 1s)
4. **processTranscriptionJob()** - Whisper API call с timeout
5. **handleJobFailure()** - Retry или fallback
6. **cleanupOldQueueJobs()** - Удаление старых записей (7 days)

**UX улучшения**:
- Placeholder "Голосовое сообщение" показывается сразу
- При успехе: уведомление с preview транскрипции + кнопка "Редактировать"
- При провале: fallback текст + задача остаётся видимой

**Файлы изменены**: `01-backend-spec.md` sections 2.2, 6.4, 6.5, 7.1, 7.2

---

### 15. TAG VS NOTE PRIORITY (уточнение)

**Проблема**: Конфликт между backend и bot specs

| Spec | Говорил |
|------|---------|
| Backend | Tag > Note length |
| Bot | Note length > Tag |

**Решение**: **Разделение ответственности**

| Атрибут | Определяется через |
|---------|-------------------|
| `folder` | Tag (если есть) → иначе AI/default |
| `type` | Content length (>500 = note) |

**Пример**:
- `#w [600 chars]` → folder='work', type='note' (заметка в рабочей папке)
- `[600 chars, no tag]` → folder='notes', type='note'
- `#i [50 chars]` → folder='ideas', type='task'

**Файлы изменены**: `01-backend-spec.md` section 2.3, `03-bot-spec.md` section 4.3

---

### 16. DONE TRAP FOR NOTES

**Проблема**: Notes marked "done" архивировались через 7 дней

**Решение**: Добавлено `AND type = 'task'` в PART 2 Sunset Engine

```sql
UPDATE tasks 
SET status = 'archived'
WHERE status = 'done'
  AND type = 'task'  -- ← NEW: Notes excluded
  AND completed_at < ?
```

**Файл изменён**: `01-backend-spec.md` line ~1017

---

### 17. TIMEZONE TRAVELER

**Проблема**: Sunset/notifications на UTC могли срабатывать некорректно при смене часового пояса

**Решение**: Добавлена функция `getUserToday(userId)` возвращающая "сегодня" в timezone пользователя

**Файл изменён**: `01-backend-spec.md` section 5.2

---

### 18. UNDO RACE CONDITION

**Проблема**: Single `pendingUndo` state — при быстром complete двух задач undo работал только для последней

**Решение**: Заменено на `Map<taskId, UndoAction>`

```typescript
// Store (before)
pendingUndo: UndoAction | null

// Store (after)
pendingUndos: Map<string, UndoAction>
addPendingUndo: (taskId: string, action: UndoAction) => void
removePendingUndo: (taskId: string) => void
```

**UI изменения**:
- Snackbar показывает "Отменить (N)" если несколько задач
- Кнопка отменяет ВСЕ pending actions
- Каждый TaskRow хранит свой timerRef

**Файлы изменены**: `02-frontend-spec.md` sections 3.1, 4.6, 4.13

---

## Updated Implementation Checklist

### Critical (before launch)
- [x] Fix capture precedence (Tag > everything) ✅
- [x] Exclude Notes from Sunset ✅
- [x] Fix zombie completion timer ✅
- [ ] Add telegram_message_id unique index
- [ ] Add bot blocked handler

### Important (MVP)
- [ ] Inbox bulk action "Отложить всё"
- [ ] Inbox tap = edit
- [ ] Global search in Shelves
- [x] Increase Mixer to 5/day ✅
- [x] Race condition fix (updated_at check) ✅
- [x] Undo queue (multiple pending) ✅
- [x] Tag vs Note priority clarified ✅

### Media (MVP)
- [ ] Media processing queue table
- [ ] Rate limiting (5/user/min)
- [ ] Retry with exponential backoff
- [ ] Fallback on failure
- [ ] Transcription complete notification
- [ ] Queue cleanup cron

### Compliance (before public)
- [ ] Trash auto-purge (90 days)
- [ ] /delete_me command
- [ ] Orphaned files cleanup cron

### Nice to have (post-MVP)
- [ ] FTS5 search for better performance
- [ ] Calendar sync conflict resolution
