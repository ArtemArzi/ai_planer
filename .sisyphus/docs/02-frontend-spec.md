# LAZY FLOW: Frontend / Mini App Specification v1.0

> **AI-Ready Specification** - Designed for implementation by Claude/GPT agents
> **Target Stack**: React + Vite + Tailwind + Framer Motion + @tma.js/sdk-react

---

## 1. SYSTEM OVERVIEW

### 1.1 Application Context
LAZY FLOW Mini App is a Telegram-native task manager following the philosophy:
- **"Capture = Exhale, Review = Inhale"**
- Minimal cognitive load
- Maximum laziness in UX
- Mobile-only experience

### 1.2 Architecture

```
[@tma.js/sdk-react] ← Theme, Auth, Haptics, Back Button
        ↓
[React + Vite] → [Components] → [Framer Motion] → [Rendering]
        ↓
[Zustand Stores] ← UI State, Undo Queue, Optimistic Updates
        ↓
[TanStack Query] ← Server State, Mutations, Cache
        ↓
[REST API] → Backend (Bun + Hono)
```

### 1.3 Technical Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | React 18 + Vite | Fast HMR, small bundles |
| State (UI) | Zustand | Undo queue, optimistic state |
| State (Server) | TanStack Query v5 | API fetching, caching, mutations |
| Styling | Tailwind CSS v3 | Utility-first, Telegram theme vars |
| Animation | Framer Motion | Swipe gestures, spring physics |
| Components | shadcn/ui + Radix | Accessible primitives |
| Bottom Sheets | Vaul | Native-feeling drawers |
| Icons | Lucide React | Minimal, consistent iconography |
| Telegram SDK | @tma.js/sdk-react | Theme, auth, haptics, back button |

---

## 2. TELEGRAM SDK INTEGRATION

### 2.1 Initialization Layer

```tsx
// src/providers/TelegramProvider.tsx
import { 
  miniApp, 
  themeParams, 
  viewport, 
  backButton,
  hapticFeedback,
  initData
} from '@tma.js/sdk-react';

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Signal app is ready
    miniApp.ready();
    
    // Expand to full viewport height
    viewport.expand();
    
    // Bind CSS variables for theme colors
    bindThemeParamsCSSVars(themeParams);
    
    // Bind CSS variables for safe areas
    bindViewportCSSVars(viewport);
  }, []);
  
  return (
    <TelegramContext.Provider value={{ initData, themeParams }}>
      {children}
    </TelegramContext.Provider>
  );
}
```

### 2.2 Theme Integration

```css
/* src/styles/telegram.css */
/* These CSS variables are bound automatically by @tma.js/sdk */

:root {
  /* Map Telegram theme params to Tailwind */
  --tg-theme-bg-color: var(--tg-bg-color);
  --tg-theme-text-color: var(--tg-text-color);
  --tg-theme-hint-color: var(--tg-hint-color);
  --tg-theme-link-color: var(--tg-link-color);
  --tg-theme-button-color: var(--tg-button-color);
  --tg-theme-button-text-color: var(--tg-button-text-color);
  --tg-theme-secondary-bg-color: var(--tg-secondary-bg-color);
  
  /* Safe areas for notch/home indicator */
  --safe-area-top: var(--tg-viewport-stable-height);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
}
```

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        'tg-bg': 'var(--tg-theme-bg-color)',
        'tg-text': 'var(--tg-theme-text-color)',
        'tg-hint': 'var(--tg-theme-hint-color)',
        'tg-link': 'var(--tg-theme-link-color)',
        'tg-button': 'var(--tg-theme-button-color)',
        'tg-button-text': 'var(--tg-theme-button-text-color)',
        'tg-secondary-bg': 'var(--tg-theme-secondary-bg-color)',
      },
      // ✨ DELIGHT: Celebration animation keyframes
      keyframes: {
        celebrate: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' }
        },
        checkBurst: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.3)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        }
      },
      animation: {
        'celebrate': 'celebrate 0.4s ease-out',
        'check-burst': 'checkBurst 0.3s ease-out'
      }
    }
  }
}
```

```css
/* src/styles/celebrations.css */
/* ✨ Task completion celebration animation */

.celebrate {
  animation: celebrate 0.4s ease-out;
}

.celebrate .checkbox-inner {
  animation: check-burst 0.3s ease-out;
}

/* Optional: Confetti burst effect */
@keyframes confetti-fall {
  0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(30px) rotate(360deg); opacity: 0; }
}
```

### 2.3 Haptic Feedback Hook

```tsx
// src/hooks/useHaptic.ts
import { hapticFeedback } from '@tma.js/sdk-react';

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'success' | 'warning' | 'error';

export function useHaptic() {
  return {
    impact: (style: ImpactStyle = 'light') => {
      hapticFeedback.impactOccurred.ifAvailable()?.(style);
    },
    notification: (type: NotificationType) => {
      hapticFeedback.notificationOccurred.ifAvailable()?.(type);
    },
    selection: () => {
      hapticFeedback.selectionChanged.ifAvailable()?.();
    }
  };
}
```

### 2.4 Back Button Management

```tsx
// src/hooks/useBackButton.ts
import { backButton } from '@tma.js/sdk-react';
import { useEffect } from 'react';

export function useBackButton(onBack: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      backButton.hide();
      return;
    }
    
    backButton.show();
    const cleanup = backButton.onClick(onBack);
    
    return () => {
      cleanup?.();
      backButton.hide();
    };
  }, [onBack, enabled]);
}
```

---

## 3. STATE MANAGEMENT

### 3.1 Zustand Store Structure

```tsx
// src/stores/uiStore.ts
import { create } from 'zustand';

interface UndoAction {
  taskId: string;
  type: 'complete' | 'delete' | 'move';
  previousState: Partial<Task>;
  timerId: number;  // Reference to setTimeout for cancellation
  createdAt: number; // ⚠️ CRITICAL: For determining if undo window elapsed
}

interface UIStore {
  // Active tab
  activeTab: 'focus' | 'shelves';
  setActiveTab: (tab: 'focus' | 'shelves') => void;
  
  // Undo queue (Map for multiple pending actions!)
  pendingUndos: Map<string, UndoAction>;
  addPendingUndo: (action: Omit<UndoAction, 'timerId'>, timerId: number) => void;
  removePendingUndo: (taskId: string) => UndoAction | undefined;
  clearAllPendingUndos: () => void;
  
  // For snackbar display - show the LATEST undo action
  latestUndoTaskId: string | null;
  
  // Swipe state
  swipingTaskId: string | null;
  swipeDirection: 'left' | 'right' | 'up' | 'down' | null;
  setSwipeState: (taskId: string | null, direction: 'left' | 'right' | 'up' | 'down' | null) => void;
  
  // Sheets/Modals
  openSheet: 'taskDetail' | 'taskEdit' | 'calendar' | 'addTask' | 'settings' | null;
  selectedTaskId: string | null;
  openTaskDetail: (taskId: string) => void;
  openTaskEdit: (taskId: string) => void;
  openCalendarSheet: (taskId: string) => void;
  openAddTask: () => void;
  closeSheet: () => void;
  
  // Sunset notification (from background job)
  sunsetCount: number | null;
  setSunsetCount: (count: number | null) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  activeTab: 'focus',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // Multiple pending undos support
  pendingUndos: new Map(),
  latestUndoTaskId: null,
  
  addPendingUndo: (action, timerId) => set((state) => {
    const newMap = new Map(state.pendingUndos);
    newMap.set(action.taskId, { ...action, timerId });
    return { 
      pendingUndos: newMap, 
      latestUndoTaskId: action.taskId 
    };
  }),
  
  removePendingUndo: (taskId) => {
    const state = get();
    const action = state.pendingUndos.get(taskId);
    if (action) {
      // Cancel the timer!
      clearTimeout(action.timerId);
      const newMap = new Map(state.pendingUndos);
      newMap.delete(taskId);
      set({ 
        pendingUndos: newMap,
        latestUndoTaskId: newMap.size > 0 ? Array.from(newMap.keys()).pop() || null : null
      });
    }
    return action;
  },
  
  clearAllPendingUndos: () => {
    const state = get();
    // Cancel ALL timers
    for (const action of state.pendingUndos.values()) {
      clearTimeout(action.timerId);
    }
    set({ pendingUndos: new Map(), latestUndoTaskId: null });
  },
  
  swipingTaskId: null,
  swipeDirection: null,
  setSwipeState: (taskId, direction) => set({ swipingTaskId: taskId, swipeDirection: direction }),
  
  openSheet: null,
  selectedTaskId: null,
  openTaskDetail: (taskId) => set({ openSheet: 'taskDetail', selectedTaskId: taskId }),
  openTaskEdit: (taskId) => set({ openSheet: 'taskEdit', selectedTaskId: taskId }),
  openCalendarSheet: (taskId) => set({ openSheet: 'calendar', selectedTaskId: taskId }),
  openAddTask: () => set({ openSheet: 'addTask' }),
  closeSheet: () => set({ openSheet: null, selectedTaskId: null }),
  
  sunsetCount: null,
  setSunsetCount: (count) => set({ sunsetCount: count })
}));

// ⚠️ UNDO PERSISTENCE: Commit pending actions on page unload
// CRITICAL: Only commit actions whose undo window has ELAPSED
// Otherwise we may commit something user intended to undo
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const state = useUIStore.getState();
    const now = Date.now();
    
    for (const [taskId, action] of state.pendingUndos) {
      clearTimeout(action.timerId);
      
      // ⚠️ Only commit if undo window has passed (2000ms)
      // If user closes app within 2s of action, DON'T commit - 
      // they may have wanted to undo
      const actionAge = now - action.createdAt;
      if (actionAge >= 2000) {
        // Undo window elapsed - safe to commit
        navigator.sendBeacon?.('/api/tasks/' + taskId, JSON.stringify({
          status: 'done',
          completedAt: Date.now()
        }));
      }
      // If actionAge < 2000, action is NOT committed
      // User can undo on next app open (task stays in previous state)
    }
  });
}
```

### 3.2 TanStack Query Hooks

> **⚠️ OFFLINE PERSISTENCE**: Configure query client with persistence for Telegram Mini App
> network instability. Without this, cache is lost on every app reload.

```tsx
// src/api/queryClient.ts
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 24 * 60 * 60 * 1000, // Keep cache for 24h
      retry: 2,
      networkMode: 'offlineFirst', // Use cache while offline
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

// Persist to localStorage for offline support
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'lazyflow-query-cache',
});

persistQueryClient({
  queryClient,
  persister,
  maxAge: 24 * 60 * 60 * 1000, // 24h
});
```

```tsx
// src/api/tasks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
interface Task {
  id: string;
  content: string;
  type: 'task' | 'note';
  status: 'inbox' | 'active' | 'backlog' | 'done' | 'archived' | 'deleted';
  folder: string;
  isIdea: boolean;
  isMixerResurfaced: boolean;
  deadline: number | null;
  createdAt: number;
  updatedAt: number;
}

// Fetch tasks
export function useTasks(filter: { status?: string; folder?: string }) {
  return useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => fetchTasks(filter),
    staleTime: 30 * 1000, // 30s
  });
}

// Inbox tasks
export function useInboxTasks() {
  return useTasks({ status: 'inbox' });
}

// Today tasks (active, sorted by deadline)
export function useTodayTasks() {
  const query = useTasks({ status: 'active' });
  
  const sorted = useMemo(() => {
    if (!query.data) return [];
    return [...query.data].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline - b.deadline;
    });
  }, [query.data]);
  
  return { ...query, data: sorted };
}

// Mutations with optimistic updates
export function useUpdateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Task> }) =>
      patchTask(id, updates),
    
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      
      // Snapshot previous value
      const previousTasks = queryClient.getQueryData(['tasks']);
      
      // Optimistically update
      queryClient.setQueriesData({ queryKey: ['tasks'] }, (old: Task[] | undefined) => {
        if (!old) return old;
        return old.map(task => 
          task.id === id ? { ...task, ...updates } : task
        );
      });
      
      return { previousTasks };
    },
    
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
      
      // ⚠️ CRITICAL: Notify user about failed update!
      // Without this, user thinks their action succeeded when it didn't
      haptic.notification('error');
      toast.error('Не удалось сохранить. Попробуйте снова.');
      console.error('Task update failed:', err);
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });
}
```

---

## 4. COMPONENT SPECIFICATIONS

### 4.1 Component Tree

```
App
├── TelegramProvider
├── QueryClientProvider
│
├── TabBar (bottom)
│   ├── TabButton (Focus) [Lucide: target]
│   └── TabButton (Shelves) [Lucide: library]
│
├── FocusTab
│   ├── InboxStack (collapsible)
│   │   ├── CardStack
│   │   │   ├── SwipeCard (top, draggable)
│   │   │   ├── PreviewCard (2nd)
│   │   │   └── PreviewCard (3rd)
│   │   └── EmptyState (when 0 cards)
│   │
│   ├── TodaySection
│   │   ├── SectionHeader ("Сегодня" + count)
│   │   ├── DraggableList (reorderable)
│   │   │   └── TaskRow[]
│   │   └── EmptyState (when 0 tasks)
│   │
│   └── FloatingActionButton (+)
│
├── ShelvesTab
│   ├── Header (⚙️ settings button)
│   ├── StoriesCarousel (Tue/Fri only)
│   │   └── StoryCard[]
│   ├── FolderList
│   │   ├── FolderRow (system folders)
│   │   ├── FolderRow (custom folders)
│   │   └── AddFolderButton
│   └── ArchiveTrashSection
│       ├── ArchiveRow
│       └── TrashRow
│
├── Sheets (Vaul drawers)
│   ├── TaskDetailSheet
│   ├── CalendarSheet (Smart Grid)
│   ├── AddTaskSheet
│   ├── SettingsSheet
│   └── FolderEditSheet
│
└── Snackbar (global undo toast)
```

### 4.2 SwipeCard Component

```tsx
// src/components/SwipeCard.tsx
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';

interface SwipeCardProps {
  task: Task;
  onSwipeComplete: (direction: 'left' | 'right' | 'up' | 'down') => void;
  isTop: boolean;
}

const SWIPE_THRESHOLD = 80; // pixels
const ROTATION_FACTOR = 15; // max degrees
const SWIPE_LOCK_THRESHOLD = 30; // Minimum horizontal movement to lock swipe direction

export function SwipeCard({ task, onSwipeComplete, isTop }: SwipeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const haptic = useHaptic();
  
  // ⚠️ GESTURE CONFLICT FIX: Track if we've committed to horizontal swipe
  // This prevents accidental swipes when user is trying to scroll vertically
  const [swipeLocked, setSwipeLocked] = useState<'horizontal' | 'vertical' | null>(null);
  
  // Rotation based on horizontal drag
  const rotate = useTransform(x, [-200, 200], [-ROTATION_FACTOR, ROTATION_FACTOR]);
  
  // Overlay opacity based on direction
  const rightOverlay = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const leftOverlay = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const upOverlay = useTransform(y, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const downOverlay = useTransform(y, [0, SWIPE_THRESHOLD], [0, 1]);
  
  function handleDrag(_: any, info: PanInfo) {
    // Lock direction after initial movement
    if (!swipeLocked && (Math.abs(info.offset.x) > SWIPE_LOCK_THRESHOLD || 
                          Math.abs(info.offset.y) > SWIPE_LOCK_THRESHOLD)) {
      if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
        setSwipeLocked('horizontal');
      } else {
        setSwipeLocked('vertical');
      }
    }
  }
  
  function handleDragEnd(_: any, info: PanInfo) {
    const { offset, velocity } = info;
    setSwipeLocked(null); // Reset for next gesture
    
    // Determine swipe direction
    let direction: 'left' | 'right' | 'up' | 'down' | null = null;
    
    if (offset.x > SWIPE_THRESHOLD) direction = 'right';
    else if (offset.x < -SWIPE_THRESHOLD) direction = 'left';
    else if (offset.y < -SWIPE_THRESHOLD) direction = 'up';
    else if (offset.y > SWIPE_THRESHOLD) direction = 'down';
    
    if (direction) {
      // ⚠️ UX SAFETY: Swipe DOWN = delete requires confirmation
      if (direction === 'down') {
        haptic.notification('warning');
        // Show confirm before delete
        if (window.confirm('Удалить задачу?')) {
          onSwipeComplete(direction);
        }
      } else {
        haptic.impact('medium');
        onSwipeComplete(direction);
      }
    }
  }
  
  return (
    <motion.div
      className="absolute w-full"
      style={{ x, y, rotate }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      whileDrag={{ cursor: 'grabbing' }}
    >
      {/* Card Content */}
      <div className="bg-tg-secondary-bg rounded-2xl p-4 shadow-lg">
        {/* Folder Badge */}
        {task.folder && task.folder !== 'inbox' && (
          <div className="flex items-center gap-1 mb-2">
            <FolderBadge folder={task.folder} />
            {task.isMixerResurfaced && <span className="text-sm">⚡️</span>}
          </div>
        )}
        
        {/* Title */}
        <p className="text-tg-text text-lg line-clamp-2">{task.content}</p>
        
        {/* Deadline */}
        {task.deadline && (
          <DeadlineIndicator deadline={task.deadline} className="mt-2" />
        )}
        
        {/* Media indicator */}
        {task.hasMedia && (
          <div className="mt-2 text-tg-hint">
            <LinkIcon className="w-4 h-4" />
          </div>
        )}
      </div>
      
      {/* Swipe Overlays */}
      <SwipeOverlay direction="right" opacity={rightOverlay}>
        <Check className="text-green-500 w-12 h-12" />
      </SwipeOverlay>
      <SwipeOverlay direction="left" opacity={leftOverlay}>
        <Clock className="text-yellow-500 w-12 h-12" />
      </SwipeOverlay>
      <SwipeOverlay direction="up" opacity={upOverlay}>
        <Calendar className="text-blue-500 w-12 h-12" />
      </SwipeOverlay>
      <SwipeOverlay direction="down" opacity={downOverlay}>
        <Trash2 className="text-red-500 w-12 h-12" />
      </SwipeOverlay>
    </motion.div>
  );
}
```

### 4.3 Card Stack Component

```tsx
// src/components/CardStack.tsx
import { AnimatePresence, motion } from 'framer-motion';

interface CardStackProps {
  tasks: Task[];
  onSwipe: (taskId: string, direction: 'left' | 'right' | 'up' | 'down') => void;
}

const PREVIEW_CARDS = 2; // Show 2 cards behind the top
const SCALE_FACTOR = 0.05; // Each card is 5% smaller
const Y_OFFSET = 8; // Vertical offset in pixels

export function CardStack({ tasks, onSwipe }: CardStackProps) {
  const visibleTasks = tasks.slice(0, PREVIEW_CARDS + 1);
  
  return (
    <div className="relative h-48 w-full">
      <AnimatePresence>
        {visibleTasks.map((task, index) => (
          <motion.div
            key={task.id}
            initial={{ scale: 1, y: 0, opacity: 1 }}
            animate={{
              scale: 1 - (index * SCALE_FACTOR),
              y: index * Y_OFFSET,
              zIndex: visibleTasks.length - index,
              opacity: index < PREVIEW_CARDS + 1 ? 1 : 0
            }}
            exit={{
              x: exitX,
              y: exitY,
              opacity: 0,
              scale: 0.8,
              transition: { duration: 0.2 }
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <SwipeCard
              task={task}
              isTop={index === 0}
              onSwipeComplete={(dir) => onSwipe(task.id, dir)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

### 4.4 Inbox Stack (Collapsible)

```tsx
// src/components/InboxStack.tsx
import { motion, AnimatePresence } from 'framer-motion';

export function InboxStack() {
  const { data: tasks, isLoading } = useInboxTasks();
  const updateTask = useUpdateTask();
  const batchUpdate = useBatchUpdateTasks();
  const { setPendingUndo, openTaskEdit } = useUIStore();
  const haptic = useHaptic();
  
  const hasCards = tasks && tasks.length > 0;
  const isOverflowing = tasks && tasks.length > 10;
  
  function handleSwipe(taskId: string, direction: 'left' | 'right' | 'up' | 'down') {
    const task = tasks?.find(t => t.id === taskId);
    if (!task) return;
    
    // Store for undo
    setPendingUndo({
      id: crypto.randomUUID(),
      type: direction === 'down' ? 'delete' : 'move',
      taskId,
      previousState: { status: task.status },
      timestamp: Date.now()
    });
    
    // Execute action
    switch (direction) {
      case 'right':
        updateTask.mutate({ id: taskId, updates: { status: 'active' } });
        break;
      case 'left':
        updateTask.mutate({ id: taskId, updates: { status: 'backlog' } });
        break;
      case 'down':
        updateTask.mutate({ id: taskId, updates: { status: 'deleted' } });
        break;
      case 'up':
        useUIStore.getState().openCalendarSheet(taskId);
        break;
    }
  }
  
  // TAP = EDIT (fix for Correction Friction)
  function handleTap(taskId: string) {
    openTaskEdit(taskId);
  }
  
  // BULK ACTION: Postpone All
  async function handlePostponeAll() {
    if (!tasks) return;
    haptic.impact('heavy');
    
    await batchUpdate.mutateAsync({
      ids: tasks.map(t => t.id),
      updates: { status: 'backlog' }
    });
    
    toast.success(`${tasks.length} задач отложено`);
  }
  
  return (
    <AnimatePresence>
      {/* ⚠️ LOADING STATE: Show skeleton during initial load */}
      {isLoading && (
        <section className="mb-6 px-4">
          <div className="h-4 w-16 bg-tg-secondary-bg rounded animate-pulse mb-2" />
          <div className="h-24 bg-tg-secondary-bg rounded-2xl animate-pulse" />
        </section>
      )}
      
      {/* ⚠️ EMPTY STATE: Show when loaded but no tasks */}
      {!isLoading && (!tasks || tasks.length === 0) && (
        <section className="mb-6 px-4">
          <div className="bg-tg-secondary-bg/50 rounded-2xl p-6 text-center">
            <div className="text-3xl mb-2">✨</div>
            <p className="text-tg-text font-medium">Inbox пуст</p>
            <p className="text-tg-hint text-sm mt-1">
              Отправьте сообщение боту, чтобы добавить задачу
            </p>
          </div>
        </section>
      )}
      
      {/* ⚠️ SWIPE COACHMARK: Show on first card for discoverability */}
      {hasCards && !localStorage.getItem('swipe_hint_shown') && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mb-2 px-4"
        >
          <div className="bg-blue-500/10 text-blue-600 text-sm rounded-lg p-3 flex items-center gap-2">
            <span>👆</span>
            <span>Свайп → в план, ← позже, ↑ дата, ↓ удалить</span>
            <button 
              onClick={() => {
                localStorage.setItem('swipe_hint_shown', 'true');
              }}
              className="ml-auto text-blue-400"
            >
              Понятно
            </button>
          </div>
        </motion.div>
      )}
      
      {hasCards && (
        <motion.section
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <h2 className="text-tg-hint text-sm mb-2 px-4">
            Inbox · {tasks.length}
          </h2>
          
          {/* Bulk action when overflowing */}
          {isOverflowing && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handlePostponeAll}
              className="w-full mb-3 mx-4 py-3 bg-yellow-500/20 rounded-xl text-yellow-600 font-medium flex items-center justify-center gap-2"
              style={{ width: 'calc(100% - 2rem)' }}
            >
              <Clock className="w-4 h-4" />
              Отложить всё ({tasks.length}) в Backlog
            </motion.button>
          )}
          
          <CardStack tasks={tasks} onSwipe={handleSwipe} onTap={handleTap} />
          
          {/* Swipe hint buttons */}
          <div className="flex justify-between px-4 mt-4">
            <ActionButton icon={<Clock />} label="Позже" />
            <ActionButton icon={<Calendar />} label="Дата" />
            <ActionButton icon={<Check />} label="В план" />
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
```

### 4.5 Today List (Draggable)

```tsx
// src/components/TodayList.tsx
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function TodayList() {
  const { data: tasks, isLoading } = useTodayTasks();
  const updateTask = useUpdateTask();
  const reorderTasks = useReorderTasks();
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 } // Prevent accidental drag
    })
  );
  
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    // Reorder locally and sync
    reorderTasks.mutate({ activeId: active.id, overId: over.id });
  }
  
  if (!tasks?.length) {
    return <EmptyTodayState />;
  }
  
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2 px-4">
          {tasks.map(task => (
            <SortableTaskRow key={task.id} task={task} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableTaskRow({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  
  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskRow task={task} />
    </li>
  );
}
```

### 4.6 TaskRow Component

```tsx
// src/components/TaskRow.tsx
import { motion, AnimatePresence } from 'framer-motion';

export function TaskRow({ task }: { task: Task }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const updateTask = useUpdateTask();
  const { addPendingUndo, removePendingUndo } = useUIStore();
  const haptic = useHaptic();
  
  function handleComplete() {
    setIsCompleting(true);
    haptic.notification('success');
    
    // ✨ DELIGHT: Celebration animation on complete!
    showCelebration();
    
    // Start timer and store reference in the undo queue
    const timerId = window.setTimeout(() => {
      updateTask.mutate({ id: task.id, updates: { status: 'done' } });
      // Remove from pending after execution
      removePendingUndo(task.id);
    }, 2000);
    
    // Add to undo queue with timer reference
    addPendingUndo({
      id: crypto.randomUUID(),
      type: 'complete',
      taskId: task.id,
      previousState: { status: task.status },
      timestamp: Date.now(),
      createdAt: Date.now()
    }, timerId);
  }
  
  // ✨ CELEBRATION ANIMATION
  function showCelebration() {
    // Trigger confetti or checkmark burst animation
    // Using canvas-confetti or custom Framer Motion animation
    const element = document.getElementById(`task-${task.id}`);
    if (element) {
      // Add celebration class that triggers CSS animation
      element.classList.add('celebrate');
      setTimeout(() => element.classList.remove('celebrate'), 600);
    }
  }
  
  function handleTap() {
    if (!isCompleting) {
      useUIStore.getState().openTaskDetail(task.id);
    }
  }
  
  return (
    <motion.div
      layout
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl bg-tg-secondary-bg",
        isCompleting && "opacity-50"
      )}
    >
      {/* Checkbox - ⚠️ ACCESSIBILITY: Min 44x44 touch target! */}
      <button
        onClick={handleComplete}
        aria-label={isCompleting ? "Отмена выполнения" : "Отметить выполненной"}
        className={cn(
          // Visual size is 24px (w-6 h-6), but touch target is 44px (min-w-11 min-h-11)
          "min-w-11 min-h-11 flex items-center justify-center",
          "rounded-full"
        )}
      >
        <span className={cn(
          "w-6 h-6 rounded-full border-2 border-tg-hint flex items-center justify-center",
          isCompleting && "bg-green-500 border-green-500"
        )}>
          {isCompleting && <Check className="w-4 h-4 text-white" />}
        </span>
      </button>
      
      {/* Content */}
      <button onClick={handleTap} className="flex-1 text-left">
        <p className={cn("text-tg-text", isCompleting && "line-through")}>
          {task.content}
        </p>
        {task.deadline && (
          <DeadlineIndicator deadline={task.deadline} size="sm" />
        )}
      </button>
      
      {/* Folder badge */}
      <FolderBadge folder={task.folder} size="sm" />
      
      {/* Drag handle (visual) */}
      <GripVertical className="w-4 h-4 text-tg-hint" />
    </motion.div>
  );
}
```

### 4.7 Deadline Indicator

```tsx
// src/components/DeadlineIndicator.tsx

type DeadlineStatus = 'overdue' | 'today' | 'tomorrow' | 'future';

function getDeadlineStatus(deadline: number): DeadlineStatus {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  
  if (deadline < now.getTime()) return 'overdue';
  if (deadlineDate < tomorrow) return 'today';
  if (deadlineDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) return 'tomorrow';
  return 'future';
}

const statusColors = {
  overdue: 'text-red-500',
  today: 'text-orange-500',
  tomorrow: 'text-yellow-500',
  future: 'text-tg-hint'
};

export function DeadlineIndicator({ deadline, size = 'md' }: { deadline: number; size?: 'sm' | 'md' }) {
  const status = getDeadlineStatus(deadline);
  const formatted = formatDeadline(deadline);
  
  return (
    <div className={cn("flex items-center gap-1", statusColors[status])}>
      <Calendar className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      <span className={size === 'sm' ? 'text-xs' : 'text-sm'}>{formatted}</span>
    </div>
  );
}
```

### 4.8 NoteCard Component

> **Notes have a different card design than tasks:**
> - No deadline chip (notes don't support deadlines)
> - Optional checkbox (hidden by default, revealed on long-press)
> - Larger text preview area
> - "Заметка" badge instead of folder badge

```tsx
// src/components/NoteCard.tsx
import { motion } from 'framer-motion';
import { FileText, Check } from 'lucide-react';

interface NoteCardProps {
  note: Task; // type='note'
  onComplete?: (noteId: string) => void;
  onTap: (noteId: string) => void;
}

export function NoteCard({ note, onComplete, onTap }: NoteCardProps) {
  const [showCheckbox, setShowCheckbox] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const haptic = useHaptic();
  
  function handleLongPress() {
    haptic.impact('light');
    setShowCheckbox(true);
  }
  
  function handleComplete() {
    if (!onComplete) return;
    setIsCompleting(true);
    haptic.notification('success');
    onComplete(note.id);
  }
  
  return (
    <motion.div
      layout
      className={cn(
        "p-4 rounded-xl bg-tg-secondary-bg",
        isCompleting && "opacity-50"
      )}
      onTap={() => onTap(note.id)}
      onTapStart={() => {}}
      onLongPress={handleLongPress}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-tg-hint">Заметка</span>
        </div>
        
        {/* Optional checkbox (appears on long-press) */}
        <AnimatePresence>
          {showCheckbox && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={handleComplete}
              className={cn(
                "w-6 h-6 rounded-full border-2 border-tg-hint flex items-center justify-center",
                isCompleting && "bg-green-500 border-green-500"
              )}
            >
              {isCompleting && <Check className="w-4 h-4 text-white" />}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      
      {/* Content preview (more lines than task) */}
      <p className={cn(
        "text-tg-text text-base line-clamp-4",
        isCompleting && "line-through"
      )}>
        {note.content}
      </p>
      
      {/* Mixer resurface indicator */}
      {note.isMixerResurfaced && (
        <div className="mt-2 text-xs text-tg-hint flex items-center gap-1">
          <span>⚡️</span>
          <span>Всплыла из архива</span>
        </div>
      )}
    </motion.div>
  );
}
```

### 4.9 Notes Folder View

```tsx
// src/components/NotesFolderView.tsx

export function NotesFolderView() {
  const { data: notes, isLoading } = useTasks({ folder: 'notes' });
  const updateTask = useUpdateTask();
  const { openTaskDetail } = useUIStore();
  
  function handleComplete(noteId: string) {
    updateTask.mutate({ 
      id: noteId, 
      updates: { status: 'done', completedAt: Date.now() } 
    });
  }
  
  if (isLoading) return <NotesSkeleton />;
  if (!notes?.length) return <EmptyNotesState />;
  
  return (
    <div className="p-4 space-y-3">
      <h2 className="text-tg-text text-lg font-semibold flex items-center gap-2">
        <FileText className="w-5 h-5" />
        Заметки
        <span className="text-tg-hint text-sm">({notes.length})</span>
      </h2>
      
      <div className="space-y-3">
        {notes.map(note => (
          <NoteCard
            key={note.id}
            note={note}
            onComplete={handleComplete}
            onTap={openTaskDetail}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyNotesState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FileText className="w-12 h-12 text-tg-hint mb-4" />
      <p className="text-tg-hint">Пока нет заметок</p>
      <p className="text-tg-hint text-sm mt-1">
        Отправьте длинное сообщение (>500 символов) в бота
      </p>
    </div>
  );
}
```
```

### 4.10 Tab Bar

```tsx
// src/components/TabBar.tsx
import { Target, Library } from 'lucide-react';

const tabs = [
  { id: 'focus', icon: Target, label: 'Фокус' },
  { id: 'shelves', icon: Library, label: 'Папки' }  // ← Renamed from "Полки" for clarity
] as const;

export function TabBar() {
  const { activeTab, setActiveTab } = useUIStore();
  const haptic = useHaptic();
  
  function handleTabChange(tab: 'focus' | 'shelves') {
    haptic.selection();
    setActiveTab(tab);
  }
  
  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-tg-bg border-t border-tg-hint/20 pb-safe"
      style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 8px)' }}
    >
      <div className="flex justify-around py-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 min-w-[64px]",
              activeTab === tab.id ? "text-tg-button" : "text-tg-hint"
            )}
          >
            <tab.icon className="w-6 h-6" />
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
```

### 4.11 Floating Action Button

```tsx
// src/components/FloatingActionButton.tsx
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

export function FloatingActionButton() {
  const { openAddTask, openSheet } = useUIStore();
  const haptic = useHaptic();
  
  // Hide when sheet is open
  if (openSheet) return null;
  
  function handleClick() {
    haptic.impact('light');
    openAddTask();
  }
  
  return (
    <motion.button
      onClick={handleClick}
      className="fixed right-4 bottom-24 w-14 h-14 rounded-full bg-tg-button shadow-lg flex items-center justify-center"
      whileTap={{ scale: 0.95 }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <Plus className="w-6 h-6 text-tg-button-text" />
    </motion.button>
  );
}
```

### 4.12 Calendar Sheet (Smart Grid)

```tsx
// src/components/CalendarSheet.tsx
import { Drawer } from 'vaul';

const quickDates = [
  { label: 'Завтра', getValue: () => addDays(new Date(), 1) },
  { label: 'Пятница', getValue: () => getNextFriday() },
  { label: 'Выходные', getValue: () => getNextWeekend() },
];

const quickTimes = [
  { label: 'Утро', time: '09:00' },
  { label: 'День', time: '14:00' },
  { label: 'Вечер', time: '19:00' },
];

export function CalendarSheet() {
  const { openSheet, selectedTaskId, closeSheet } = useUIStore();
  const updateTask = useUpdateTask();
  const haptic = useHaptic();
  
  function handleSelect(date: Date, time?: string) {
    haptic.impact('light');
    
    const deadline = time
      ? setTimeOnDate(date, time)
      : date;
    
    updateTask.mutate({ 
      id: selectedTaskId!, 
      updates: { 
        deadline: deadline.getTime(),
        status: 'active' // Move to Today after scheduling
      } 
    });
    
    closeSheet();
  }
  
  return (
    <Drawer.Root open={openSheet === 'calendar'} onOpenChange={(open) => !open && closeSheet()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="bg-tg-bg fixed bottom-0 left-0 right-0 rounded-t-3xl p-4">
          <Drawer.Handle className="mx-auto w-12 h-1.5 bg-tg-hint/30 rounded-full mb-4" />
          
          <h3 className="text-tg-text text-lg font-semibold mb-4">Когда?</h3>
          
          {/* Quick Dates */}
          <div className="flex flex-wrap gap-2 mb-4">
            {quickDates.map(date => (
              <button
                key={date.label}
                onClick={() => handleSelect(date.getValue())}
                className="px-4 py-2 bg-tg-secondary-bg rounded-full text-tg-text"
              >
                {date.label}
              </button>
            ))}
            <button className="px-4 py-2 bg-tg-secondary-bg rounded-full text-tg-hint">
              Выбрать дату...
            </button>
          </div>
          
          {/* Quick Times */}
          <h4 className="text-tg-hint text-sm mb-2">Время</h4>
          <div className="flex gap-2">
            {quickTimes.map(time => (
              <button
                key={time.label}
                onClick={() => handleSelect(new Date(), time.time)}
                className="flex-1 py-3 bg-tg-secondary-bg rounded-xl text-tg-text"
              >
                <div className="text-sm">{time.label}</div>
                <div className="text-xs text-tg-hint">{time.time}</div>
              </button>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

### 4.13 Snackbar (Global Undo)

> **⚠️ UX FIX**: When multiple actions pending, allow user to undo ALL or choose specific one.

```tsx
// src/components/Snackbar.tsx
import { motion, AnimatePresence } from 'framer-motion';

export function Snackbar() {
  const { pendingUndos, latestUndoTaskId, removePendingUndo, clearAllPendingUndos } = useUIStore();
  const updateTask = useUpdateTask();
  const haptic = useHaptic();
  
  // Get the latest action to display
  const latestAction = latestUndoTaskId ? pendingUndos.get(latestUndoTaskId) : null;
  const pendingCount = pendingUndos.size;
  
  // Undo single action
  function handleUndoLatest() {
    if (!latestAction) return;
    
    haptic.notification('success');
    
    // Restore previous state
    updateTask.mutate({
      id: latestAction.taskId,
      updates: latestAction.previousState
    });
    
    // Remove from queue (this also cancels the timer!)
    removePendingUndo(latestAction.taskId);
  }
  
  // ⚠️ UNDO ALL: When multiple actions pending, let user undo everything
  function handleUndoAll() {
    haptic.notification('success');
    
    // Restore all pending actions
    for (const [taskId, action] of pendingUndos) {
      clearTimeout(action.timerId);
      updateTask.mutate({
        id: taskId,
        updates: action.previousState
      });
    }
    
    clearAllPendingUndos();
    toast.success(`${pendingCount} действий отменено`);
  }
  
  const actionLabels = {
    complete: 'Выполнено',
    archive: 'В архив',
    delete: 'Удалено',
    move: 'Перемещено'
  };
  
  return (
    <AnimatePresence>
      {latestAction && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 left-4 right-4 bg-gray-900 text-white rounded-xl p-4 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{actionLabels[latestAction.type]}</span>
              {pendingCount > 1 && (
                <span className="text-gray-400 text-sm">
                  (+{pendingCount - 1})
                </span>
              )}
            </div>
            
            <div className="flex gap-3">
              {/* ⚠️ Undo ALL when multiple actions pending */}
              {pendingCount > 1 && (
                <button
                  onClick={handleUndoAll}
                  className="text-tg-link font-medium text-sm min-h-11 px-2"
                  aria-label={`Отменить все ${pendingCount} действий`}
                >
                  Отменить всё ({pendingCount})
                </button>
              )}
              
              <button
                onClick={handleUndoLatest}
                className="text-tg-link font-medium uppercase text-sm min-h-11 px-2"
                aria-label="Отменить последнее действие"
              >
                Отменить
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 left-4 right-4 bg-gray-900 text-white rounded-xl p-4 flex items-center justify-between shadow-lg"
        >
          <span>{actionLabels[pendingUndo.type]}</span>
          <button
            onClick={handleUndo}
            className="text-tg-link font-medium uppercase text-sm"
          >
            Отменить
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### 4.14 Completed Tasks View

> **Shows tasks completed in last 7 days before they auto-archive.**

```tsx
// src/components/CompletedTasksView.tsx
import { CheckCircle, RotateCcw } from 'lucide-react';

export function CompletedTasksView() {
  const { data: tasks, isLoading } = useTasks({ status: 'done' });
  const updateTask = useUpdateTask();
  const haptic = useHaptic();
  
  function handleRestore(taskId: string) {
    haptic.notification('success');
    updateTask.mutate({
      id: taskId,
      updates: { status: 'active', completedAt: null }
    });
  }
  
  if (isLoading) return <TaskListSkeleton />;
  if (!tasks?.length) return <EmptyCompletedState />;
  
  // Group by day
  const grouped = groupByDay(tasks, 'completedAt');
  
  return (
    <div className="p-4">
      <h2 className="text-tg-text text-lg font-semibold flex items-center gap-2 mb-4">
        <CheckCircle className="w-5 h-5 text-green-500" />
        Выполнено
        <span className="text-tg-hint text-sm">({tasks.length})</span>
      </h2>
      
      <p className="text-tg-hint text-xs mb-4">
        Автоархивация через 7 дней
      </p>
      
      {Object.entries(grouped).map(([day, dayTasks]) => (
        <div key={day} className="mb-4">
          <h3 className="text-tg-hint text-xs uppercase mb-2">{day}</h3>
          <div className="space-y-2">
            {dayTasks.map(task => (
              <CompletedTaskRow
                key={task.id}
                task={task}
                onRestore={() => handleRestore(task.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompletedTaskRow({ task, onRestore }: { task: Task; onRestore: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-tg-secondary-bg opacity-60">
      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
      <p className="flex-1 text-tg-text line-through text-sm">
        {task.content}
      </p>
      <button
        onClick={onRestore}
        className="p-2 text-tg-hint hover:text-tg-text"
        aria-label="Восстановить"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
}

function EmptyCompletedState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle className="w-12 h-12 text-tg-hint mb-4" />
      <p className="text-tg-hint">Нет выполненных задач</p>
    </div>
  );
}
```

---

## 5. SCREEN SPECIFICATIONS

### 5.1 Focus Tab (Main)

```
┌────────────────────────────────────┐
│                              (app) │
├────────────────────────────────────┤
│                                    │
│  Inbox · 3                         │  ← Section header
│  ┌────────────────────────────┐    │
│  │  ⚡️ 💼 Работа              │    │  ← Swipe card (top)
│  │                            │    │
│  │  Подготовить презентацию   │    │
│  │                            │    │
│  │  📅 Завтра, 10:00          │    │
│  └────────────────────────────┘    │
│     ┌──────────────────────┐       │  ← Preview card 2
│        ┌────────────────┐          │  ← Preview card 3
│                                    │
│  [📁 Позже]  [📅]  [🚀 В план]    │  ← Action hints
│                                    │
├────────────────────────────────────┤
│                                    │
│  Сегодня · 5                       │  ← Section header
│                                    │
│  ┌────────────────────────────┐    │
│  │ ○  Встреча с клиентом      │    │  ← Task row
│  │    📅 Сегодня, 14:00  💼   │    │
│  └────────────────────────────┘    │
│  ┌────────────────────────────┐    │
│  │ ○  Ответить на письма      │    │
│  │    💼                       │    │
│  └────────────────────────────┘    │
│  ...                               │
│                                    │
│                           [+]      │  ← FAB
│                                    │
├────────────────────────────────────┤
│  [🎯 Фокус]      [📚 Полки]       │  ← Tab bar
└────────────────────────────────────┘
```

### 5.2 Shelves Tab

```
┌────────────────────────────────────┐
│  Полки                        ⚙️   │  ← Header + settings
├────────────────────────────────────┤
│  🔍 Поиск задач и заметок...      │  ← NEW: Global search bar
├────────────────────────────────────┤
│                                    │
│  [Story1] [Story2] [Story3] →      │  ← Stories carousel (Tue/Fri)
│                                    │
├────────────────────────────────────┤
│                                    │
│  ✅ Выполнено                  3 › │  ← NEW: Completed (last 7 days)
│                                    │
│  💼 Работа                    12 › │  ← Folder row
│  🏠 Личное                     8 › │
│  💡 Идеи                      23 › │
│  📚 Медиа                      4 › │
│  📝 Заметки                    2 › │
│                                    │
│  ── Мои папки ──────────────────   │
│  🎨 Дизайн                     5 › │  ← Custom folder
│  [+ Добавить папку]                │
│                                    │
├────────────────────────────────────┤
│  🗄️ Архив                    45 › │
│  🗑️ Корзина                   3 › │
│                                    │
├────────────────────────────────────┤
│  [🎯 Фокус]      [📚 Полки]       │
└────────────────────────────────────┘
```

### 5.2.1 Global Search Component

```tsx
// src/components/GlobalSearch.tsx
import { Search, X } from 'lucide-react';
import { useState, useDeferredValue } from 'react';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const { data: results, isLoading } = useSearchTasks(deferredQuery);
  
  return (
    <div className="p-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-hint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск задач и заметок..."
          className="w-full pl-10 pr-10 py-3 bg-tg-secondary-bg rounded-xl text-tg-text placeholder:text-tg-hint"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-tg-hint" />
          </button>
        )}
      </div>
      
      {/* Results */}
      {deferredQuery.length >= 2 && (
        <div className="mt-4 space-y-2">
          {isLoading ? (
            <SearchSkeleton />
          ) : results?.length === 0 ? (
            <p className="text-center text-tg-hint py-8">Ничего не найдено</p>
          ) : (
            results?.map(task => (
              <SearchResultRow key={task.id} task={task} query={deferredQuery} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ task, query }: { task: Task; query: string }) {
  const { openTaskDetail } = useUIStore();
  
  // ⚠️ XSS PROTECTION: Sanitize content before inserting HTML
  // CRITICAL: task.content is user-generated and could contain malicious scripts
  
  // Option 1: Use DOMPurify (RECOMMENDED)
  // import DOMPurify from 'dompurify';
  // const sanitizedContent = DOMPurify.sanitize(task.content);
  // const highlightedContent = sanitizedContent.replace(...)
  
  // Option 2: Use text-based highlighting without innerHTML
  // This is safer and simpler:
  const parts = task.content.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  
  return (
    <button
      onClick={() => openTaskDetail(task.id)}
      className="w-full p-3 bg-tg-secondary-bg rounded-xl text-left"
      aria-label={`Задача: ${task.content.slice(0, 50)}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <FolderBadge folder={task.folder} size="sm" />
        <span className="text-xs text-tg-hint">
          {task.type === 'note' ? '📝' : '📋'}
        </span>
      </div>
      {/* Safe text-based highlighting - NO dangerouslySetInnerHTML! */}
      <p className="text-tg-text line-clamp-2">
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() 
            ? <mark key={i} className="bg-yellow-200 text-tg-text">{part}</mark>
            : part
        )}
      </p>
    </button>
  );
}

// API Hook
function useSearchTasks(query: string) {
  return useQuery({
    queryKey: ['tasks', 'search', query],
    queryFn: () => query.length >= 2 ? searchTasks(query) : [],
    enabled: query.length >= 2,
    staleTime: 10 * 1000,
  });
}
```

### 5.3 Settings Sheet

```
┌────────────────────────────────────┐
│  ─────── (drag handle)             │
│                                    │
│  ⚙️ Настройки                      │
│                                    │
├────────────────────────────────────┤
│  УВЕДОМЛЕНИЯ                       │
│  ┌────────────────────────────┐    │
│  │ Утренний дайджест    [🔵]  │    │  ← Toggle
│  │ Время: 09:00         [›]   │    │  ← Time picker
│  │ Deadline напоминания [🔵]  │    │
│  │ За: 60 минут         [›]   │    │
│  └────────────────────────────┘    │
│                                    │
├────────────────────────────────────┤
│  ИНТЕГРАЦИИ                        │
│  ┌────────────────────────────┐    │
│  │ 📅 Google Calendar         │    │
│  │ [Подключить]               │    │  ← OAuth button
│  └────────────────────────────┘    │
│                                    │
├────────────────────────────────────┤
│  AI                                │
│  ┌────────────────────────────┐    │
│  │ Автоклассификация    [🔵]  │    │
│  └────────────────────────────┘    │
│                                    │
├────────────────────────────────────┤
│  ДАННЫЕ                            │
│  ┌────────────────────────────┐    │
│  │ 🗄️ Архив (45)         [›]  │    │
│  │ 🗑️ Корзина (3)        [›]  │    │
│  │ [Очистить корзину]         │    │
│  └────────────────────────────┘    │
│                                    │
└────────────────────────────────────┘
```

---

## 6. ANIMATION SPECIFICATIONS

### 6.1 Spring Configurations

```ts
// src/config/animations.ts

export const springConfigs = {
  // Default for most transitions
  default: { stiffness: 300, damping: 25, mass: 1 },
  
  // Snappy for button presses
  snappy: { stiffness: 400, damping: 30, mass: 0.8 },
  
  // Bouncy for card stack reorder
  bouncy: { stiffness: 250, damping: 20, mass: 1 },
  
  // Gentle for sheet reveal
  gentle: { stiffness: 200, damping: 25, mass: 1.2 }
};

export const durations = {
  fast: 0.15,      // Button press feedback
  normal: 0.25,    // Standard transitions
  slow: 0.4,       // Sheet open/close
  cardExit: 0.2    // Card swipe exit
};
```

### 6.2 Animation Details

| Animation | Trigger | Duration/Spring | Details |
|-----------|---------|-----------------|---------|
| Card swipe exit | Threshold crossed | 200ms, ease-out | Exit to screen edge + direction |
| Card stack reorder | Top card removed | spring: bouncy | Scale 0.95→1, Y offset up |
| Inbox collapse | Last card swiped | 300ms | Height to 0, fade out |
| Tab switch | Tab tap | instant | No animation, immediate |
| Bottom sheet | Trigger tap | spring: gentle | Vaul default |
| Snackbar enter | Action | spring: default | Slide up from bottom |
| Snackbar exit | Timeout/undo | 200ms | Slide down + fade |
| Skeleton pulse | Loading | infinite | Shimmer left to right |
| Completion checkmark | Complete tap | spring: snappy | Scale 0→1 |
| Task strikethrough | After checkmark | 200ms | Line-through + opacity |
| FAB appear | Initial render | spring: bouncy | Scale 0→1 |
| Drag reorder | Drag move | realtime | Follow finger |

---

## 7. ACCESSIBILITY

### 7.1 Requirements

- **Touch targets**: Minimum 44x44px for all interactive elements
- **Color contrast**: Use Telegram theme (assume compliant)
- **Screen reader**: aria-labels on all buttons
- **Reduced motion**: Respect `prefers-reduced-motion`
- **Focus management**: Return focus after modal close

### 7.2 Alternative Actions for Swipe

```tsx
// For users who can't swipe, provide button alternatives
<div className="flex justify-between mt-4 px-4">
  <button aria-label="Отложить задачу" onClick={() => handleSwipe('left')}>
    <Clock className="w-6 h-6" />
  </button>
  <button aria-label="Запланировать" onClick={() => handleSwipe('up')}>
    <Calendar className="w-6 h-6" />
  </button>
  <button aria-label="В план на сегодня" onClick={() => handleSwipe('right')}>
    <Check className="w-6 h-6" />
  </button>
</div>
```

### 7.3 Reduced Motion

```tsx
// src/hooks/useReducedMotion.ts
export function useReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Usage in animations
const reducedMotion = useReducedMotion();
const transition = reducedMotion 
  ? { duration: 0 } 
  : { type: 'spring', ...springConfigs.default };
```

---

## 8. ERROR HANDLING

### 8.1 Network Error Strategy

```tsx
// On mutation failure:
// 1. Rollback optimistic update
// 2. Show error snackbar
// 3. Offer retry

function handleMutationError(error: Error, variables: any, context: any) {
  // Rollback
  queryClient.setQueryData(['tasks'], context.previousTasks);
  
  // Show error
  toast.error('Не удалось сохранить. Попробуйте ещё раз.', {
    action: {
      label: 'Повторить',
      onClick: () => mutation.mutate(variables)
    }
  });
}
```

### 8.2 Loading States

- **Initial load**: Skeleton for card stack + task list
- **Mutation pending**: Disable further swipes on that card
- **Refetching**: No visible indicator (background)

---

## 9. BACKEND API INTEGRATION

### 9.1 Endpoints Used

| Action | Method | Endpoint | Optimistic? |
|--------|--------|----------|-------------|
| Get inbox tasks | GET | `/api/tasks?status=inbox` | N/A |
| Get today tasks | GET | `/api/tasks?status=active` | N/A |
| Get folder tasks | GET | `/api/tasks?folder={id}` | N/A |
| Update task | PATCH | `/api/tasks/:id` | Yes |
| Create task | POST | `/api/tasks` | Yes |
| Reorder tasks | PATCH | `/api/tasks/reorder` | Yes |
| Run mixer | POST | `/api/mixer/run` | N/A |
| Get folders | GET | `/api/folders` | N/A |
| Create folder | POST | `/api/folders` | Yes |
| Update folder | PATCH | `/api/folders/:id` | Yes |
| Get settings | GET | `/api/me/settings` | N/A |
| Update settings | PATCH | `/api/me/settings` | Yes |

### 9.2 Authentication

```tsx
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_URL;

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const initData = miniApp.initData || '';
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}
```

---

## 10. BUILD & DEPLOYMENT

### 10.1 Vite Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'framer': ['framer-motion'],
          'query': ['@tanstack/react-query'],
          'telegram': ['@tma.js/sdk-react']
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
```

### 10.2 Environment Variables

```bash
VITE_API_URL=https://api.lazyflow.app
VITE_TELEGRAM_BOT_ID=your_bot_id
```

---

## 11. IMPLEMENTATION CHECKLIST

### Phase 1: Core Setup
- [ ] Vite + React + TypeScript project
- [ ] Tailwind CSS + Telegram theme vars
- [ ] @tma.js/sdk-react integration
- [ ] TanStack Query setup
- [ ] Zustand stores

### Phase 2: Tab Navigation
- [ ] Tab bar component
- [ ] Focus tab container
- [ ] Shelves tab container
- [ ] Navigation state

### Phase 3: Inbox Stack
- [ ] SwipeCard component
- [ ] CardStack with AnimatePresence
- [ ] Swipe gesture handling
- [ ] Swipe overlays
- [ ] Haptic feedback
- [ ] Collapsible animation

### Phase 4: Today List
- [ ] TaskRow component
- [ ] Completion animation
- [ ] Drag-and-drop reorder
- [ ] Deadline indicator

### Phase 5: Sheets
- [ ] Vaul bottom sheet setup
- [ ] TaskDetailSheet
- [ ] CalendarSheet (Smart Grid)
- [ ] AddTaskSheet
- [ ] SettingsSheet

### Phase 6: Shelves
- [ ] FolderList component
- [ ] FolderRow component
- [ ] StoriesCarousel
- [ ] Archive/Trash views

### Phase 7: Notes & Completed
- [ ] NoteCard component (4.8)
- [ ] NotesFolderView (4.9)
- [ ] CompletedTasksView (4.14)
- [ ] Restore from done functionality
- [ ] Long-press checkbox reveal for notes

### Phase 8: Polish
- [ ] Snackbar (undo)
- [ ] Skeleton loading
- [ ] Empty states
- [ ] Error handling
- [ ] Accessibility audit

---

## APPENDIX: Folder Colors

| Folder (System) | Color | Hex |
|-----------------|-------|-----|
| work | Blue | #3B82F6 |
| personal | Green | #22C55E |
| ideas | Yellow | #EAB308 |
| media | Purple | #A855F7 |
| notes | Gray | #6B7280 |

Custom folders: User selects from palette of 8 colors.

---

## APPENDIX: Swipe Action Matrix

| Direction | Visual | Haptic | Action | New Status |
|-----------|--------|--------|--------|------------|
| RIGHT | ✅ Green overlay | Medium | В план | active |
| LEFT | ⏰ Yellow overlay | Light | Отложить | backlog |
| UP | 📅 Blue overlay | Light | Календарь | (sheet opens) |
| DOWN | 🗑 Red overlay | Heavy | Удалить | deleted |

---

**NOTE FOR BACKEND**: This specification assumes the addition of a `folders` table to support custom folders. Please update Backend Spec with:

```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id),
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT, -- hex color
  position INTEGER DEFAULT 0,
  is_system INTEGER DEFAULT 0, -- 1 for system folders
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

*Generated by Prometheus Planner*
*Version: 1.0*
*Date: 2026-02-04*
