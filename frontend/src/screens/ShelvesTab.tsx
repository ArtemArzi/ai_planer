import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, Reorder, useDragControls, type PanInfo } from "framer-motion";
import { Drawer } from "vaul";
import { useFolders, getFolderMeta, getSystemFallbackFolders, toAlphaColor } from "../api/folders";
import { useTasks, useUpdateTask, type FolderSlug, type Task } from "../api/tasks";
import { useMe } from "../api/users";
import { SearchBar, highlightText } from "../components/SearchBar";
import { useUIStore } from "../stores/uiStore";
import { TaskRow } from "../components/TaskRow";
import { FolderIcon, isMaterialIconGlyph, resolveFolderIconGlyph } from "../components/FolderIcon";
import { FolderManageView } from "../components/FolderManageView";
import { NoteCard } from "../components/NoteCard";
import { IdeaCard } from "../components/IdeaCard";

function ReorderableTask({ task }: { task: Task }) {
  const controls = useDragControls();
  const setIsDraggingTask = useUIStore((state) => state.setIsDraggingTask);

  return (
    <Reorder.Item
      value={task}
      dragListener={false}
      dragControls={controls}
      className="list-none"
      onDragStart={() => setIsDraggingTask(true)}
      onDragEnd={() => setIsDraggingTask(false)}
    >
      <TaskRow task={task} dragControls={controls} />
    </Reorder.Item>
  );
}

const SWIPE_BACK_THRESHOLD = 30;
const STORIES_SEEN_STORAGE_PREFIX = "idea-stories-seen";
const EMOJI_REGEX = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;

type SubView = { type: "folder"; folder: FolderSlug } | { type: "archive" } | { type: "manage" } | null;

const pageTransition = {
  initial: { x: 40, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -20, opacity: 0 },
  transition: { type: "tween", ease: [0.25, 0.1, 0.25, 1], duration: 0.2 },
};

function countByFolder(tasks: Task[], folder: FolderSlug): number {
  return tasks.filter((task) => task.folder === folder && task.status !== "deleted").length;
}

function getTasksByFolder(tasks: Task[], folder: FolderSlug): Task[] {
  return tasks.filter((task) => task.folder === folder && task.status !== "deleted");
}

function getArchivedTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status === "done" || task.status === "archived");
}

function getIdeaStories(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.folder === "ideas" && task.status !== "deleted" && task.status !== "done" && task.status !== "archived")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 24);
}

function parseIdeaContent(content: string) {
  const trimmed = content.trim();
  const emojiMatch = trimmed.match(EMOJI_REGEX);

  let icon: string | null = null;
  let text = trimmed;

  if (emojiMatch) {
    icon = emojiMatch[0];
    text = trimmed.slice(icon.length).trim();
  }

  // Get first 1-2 words for subtitle
  const words = text.split(/\s+/).filter(Boolean);
  const shortTitle = words.slice(0, 2).join(" ").slice(0, 16);

  // Get first line as full title
  const fullTitle = text.split("\n")[0].slice(0, 40);

  return { icon, text, shortTitle, fullTitle };
}

type StoryVisual = {
  icon: string;
  gradient: string;
};

const STORY_VISUALS: StoryVisual[] = [
  { icon: "lightbulb", gradient: "linear-gradient(135deg, #60A5FA 0%, #4F46E5 100%)" },
  { icon: "call", gradient: "linear-gradient(135deg, #818CF8 0%, #9333EA 100%)" },
  { icon: "emoji_objects", gradient: "linear-gradient(135deg, #FB923C 0%, #EF4444 100%)" },
  { icon: "architecture", gradient: "linear-gradient(135deg, #38BDF8 0%, #06B6D4 100%)" },
  { icon: "favorite", gradient: "linear-gradient(135deg, #F87171 0%, #DB2777 100%)" },
  { icon: "edit_note", gradient: "linear-gradient(135deg, #FACC15 0%, #F97316 100%)" },
];

function hashStoryId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getStoryVisual(taskId: string): StoryVisual {
  return STORY_VISUALS[hashStoryId(taskId) % STORY_VISUALS.length];
}

function buildStoriesSeenStorageKey(userId?: number): string {
  return `${STORIES_SEEN_STORAGE_PREFIX}:${userId ?? "anon"}`;
}

function loadStoriesSeenSet(storageKey: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function saveStoriesSeenSet(storageKey: string, seenIds: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIds)));
  } catch {
    // Ignore storage write errors
  }
}

export function ShelvesTab() {
  const { data: tasks = [], isLoading: tasksLoading } = useTasks({ limit: 150 });
  const { data: me } = useMe();
  const { data: foldersData = [], isLoading: foldersLoading } = useFolders();
  const folders = useMemo(
    () => (foldersData.length > 0 ? foldersData : getSystemFallbackFolders()),
    [foldersData],
  );
  const updateTask = useUpdateTask();
  const openSettings = useUIStore((state) => state.openSettings);
  const [searchQuery, setSearchQuery] = useState("");
  const [subView, setSubView] = useState<SubView>(null);
  const [orderedFolderTasks, setOrderedFolderTasks] = useState<Task[]>([]);
  const [seenStoryIds, setSeenStoryIds] = useState<Set<string>>(new Set());
  const [storyPreviewOpen, setStoryPreviewOpen] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const selectedFolder = subView?.type === "folder" ? subView.folder : null;
  const isLoading = tasksLoading || foldersLoading;

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return tasks
      .filter((task) => task.status !== "deleted")
      .filter((task) => task.content.toLowerCase().includes(query))
      .slice(0, 20);
  }, [searchQuery, tasks]);

  const archivedTasks = getArchivedTasks(tasks);
  const archivedCount = archivedTasks.length;
  const ideaStories = useMemo(() => getIdeaStories(tasks), [tasks]);
  const storiesEnabled = me?.storiesNotifications ?? true;
  const storiesSeenStorageKey = useMemo(() => buildStoriesSeenStorageKey(me?.telegramId), [me?.telegramId]);

  const stories = useMemo(() => {
    const withSeen = ideaStories.map((task) => ({
      task,
      seen: seenStoryIds.has(task.id),
    }));

    return withSeen.sort((a, b) => {
      if (a.seen !== b.seen) {
        return a.seen ? 1 : -1;
      }
      return b.task.updatedAt - a.task.updatedAt;
    });
  }, [ideaStories, seenStoryIds]);

  const activeStoryIndex = useMemo(() => stories.findIndex((item) => item.task.id === activeStoryId), [stories, activeStoryId]);
  const activeStory = activeStoryIndex >= 0 ? stories[activeStoryIndex] : null;

  useEffect(() => {
    setSeenStoryIds(loadStoriesSeenSet(storiesSeenStorageKey));
  }, [storiesSeenStorageKey]);

  useEffect(() => {
    if (ideaStories.length === 0) {
      return;
    }

    setSeenStoryIds((previous) => {
      const activeIds = new Set(ideaStories.map((task) => task.id));
      const next = new Set(Array.from(previous).filter((id) => activeIds.has(id)));

      if (next.size !== previous.size) {
        saveStoriesSeenSet(storiesSeenStorageKey, next);
        return next;
      }

      return previous;
    });
  }, [ideaStories, storiesSeenStorageKey]);

  useEffect(() => {
    if (!storyPreviewOpen) {
      return;
    }

    if (!storiesEnabled || stories.length === 0 || !activeStory) {
      setStoryPreviewOpen(false);
      setActiveStoryId(null);
    }
  }, [activeStory, stories.length, storiesEnabled, storyPreviewOpen]);

  const markStorySeen = (taskId: string) => {
    setSeenStoryIds((previous) => {
      if (previous.has(taskId)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(taskId);
      saveStoriesSeenSet(storiesSeenStorageKey, next);
      return next;
    });
  };

  const handleStoryOpen = (taskId: string) => {
    markStorySeen(taskId);
    setActiveStoryId(taskId);
    setStoryPreviewOpen(true);
  };

  const handleStoryStep = (direction: -1 | 1) => {
    if (stories.length === 0) {
      return;
    }

    const currentIndex = activeStoryIndex >= 0 ? activeStoryIndex : 0;
    const nextIndex = (currentIndex + direction + stories.length) % stories.length;
    const nextStoryId = stories[nextIndex].task.id;

    markStorySeen(nextStoryId);
    setActiveStoryId(nextStoryId);
  };

  const handleOpenStoryDetail = () => {
    if (!activeStory) {
      return;
    }

    setStoryPreviewOpen(false);
    useUIStore.getState().openTaskDetail(activeStory.task.id);
  };

  const folderTasks = useMemo(() => {
    if (!selectedFolder) {
      return [];
    }
    return getTasksByFolder(tasks, selectedFolder);
  }, [tasks, selectedFolder]);

  useEffect(() => {
    if (!selectedFolder) {
      setOrderedFolderTasks([]);
      return;
    }

    setOrderedFolderTasks((prev) => {
      if (!prev.length) {
        return folderTasks;
      }

      const byId = new Map(folderTasks.map((task) => [task.id, task]));
      const kept = prev
        .map((task) => byId.get(task.id))
        .filter((task): task is Task => task !== undefined);
      const added = folderTasks.filter((task) => !kept.some((current) => current.id === task.id));
      return [...kept, ...added];
    });
  }, [selectedFolder, folderTasks]);

  const handleSwipeBack = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const force = info.offset.x + info.velocity.x * 0.3;
    if (force > SWIPE_BACK_THRESHOLD) {
      setSubView(null);
    }
  };

  if (subView?.type === "folder") {
    const config = getFolderMeta(subView.folder, folders);
    const iconBg = toAlphaColor(config.color, 0.14);
    const displayTasks = orderedFolderTasks.length ? orderedFolderTasks : folderTasks;

    return (
      <AnimatePresence mode="wait">
        <motion.section
          key={`folder-${subView.folder}`}
          className="mx-auto w-full max-w-lg px-5 pb-36 pt-6"
          {...pageTransition}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.4 }}
          onDragEnd={handleSwipeBack}
        >
          <header className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-tg-secondary-bg text-icon-muted active:scale-95"
            >
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <div>
              <h1 className="text-xl font-bold text-tg-text">{config.displayName}</h1>
              <p className="text-sm text-tg-hint">{displayTasks.length} задач</p>
            </div>
          </header>

          {displayTasks.length === 0 && (
            <div className="rounded-2xl bg-tg-secondary-bg p-6 text-center">
              <div
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: iconBg }}
              >
                <FolderIcon icon={config.icon} className="text-2xl leading-none" style={{ color: config.color }} />
              </div>
              <p className="font-medium text-tg-text">Пусто</p>
              <p className="mt-1 text-sm text-tg-hint">В этой папке пока нет задач</p>
            </div>
          )}

          {displayTasks.length > 0 && subView.folder === "notes" && (
            <div className="space-y-2">
              {displayTasks.map((task) => (
                <NoteCard key={task.id} task={task} onTap={(id) => useUIStore.getState().openTaskDetail(id)} />
              ))}
            </div>
          )}

          {displayTasks.length > 0 && subView.folder === "ideas" && (
            <div className="space-y-2">
              {displayTasks.map((task) => (
                <IdeaCard key={task.id} task={task} onTap={(id) => useUIStore.getState().openTaskDetail(id)} />
              ))}
            </div>
          )}

          {displayTasks.length > 0 && subView.folder !== "notes" && subView.folder !== "ideas" && (
            <Reorder.Group
              axis="y"
              values={displayTasks}
              onReorder={setOrderedFolderTasks}
              className="space-y-2"
            >
              {displayTasks.map((task) => (
                <ReorderableTask key={task.id} task={task} />
              ))}
            </Reorder.Group>
          )}
        </motion.section>
      </AnimatePresence>
    );
  }

  // ── Sub-view: Manage folders ──
  if (subView?.type === "manage") {
    return (
      <AnimatePresence mode="wait">
        <FolderManageView key="manage" onBack={() => setSubView(null)} />
      </AnimatePresence>
    );
  }

  // ── Sub-view: Archive ──
  if (subView?.type === "archive") {
    return (
      <AnimatePresence mode="wait">
        <motion.section
          key="archive"
          className="mx-auto w-full max-w-lg px-5 pb-36 pt-6"
          {...pageTransition}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.4 }}
          onDragEnd={handleSwipeBack}
        >
          <header className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-tg-secondary-bg text-icon-muted active:scale-95"
            >
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <div>
              <h1 className="text-xl font-bold text-tg-text">Архив</h1>
              <p className="text-sm text-tg-hint">{archivedCount} задач</p>
            </div>
          </header>

          {archivedTasks.length === 0 && (
            <div className="rounded-2xl bg-tg-secondary-bg p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-soft-green/10">
                <span className="material-symbols-outlined text-2xl text-soft-green">check_circle</span>
              </div>
              <p className="font-medium text-tg-text">Архив пуст</p>
              <p className="mt-1 text-sm text-tg-hint">Завершённые задачи появятся здесь</p>
            </div>
          )}

          {archivedTasks.length > 0 && (
            <ul className="space-y-2">
              {archivedTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 rounded-2xl bg-tg-secondary-bg p-4"
                >
                  <p className="flex-1 text-sm text-tg-text line-through opacity-60 line-clamp-3">{task.content}</p>
                  <button
                    type="button"
                    onClick={() => updateTask.mutate({ id: task.id, updates: { status: "active", completedAt: null } })}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-tg-bg px-3 text-xs font-medium text-tg-link"
                  >
                    <span className="material-symbols-outlined text-base">undo</span>
                    Вернуть
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </AnimatePresence>
    );
  }

  // ── Main view: Shelves grid ──
  return (
    <section className="mx-auto w-full max-w-lg px-5 pb-36 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-tg-text">Полки</h1>
        <button
          type="button"
          onClick={openSettings}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-tg-secondary-bg text-icon-muted transition-colors hover:bg-black/10"
          aria-label="Настройки"
        >
          <span className="material-symbols-outlined text-xl">settings</span>
        </button>
      </header>

      <div className="mb-5">
        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Поиск по задачам" />
      </div>

      {storiesEnabled && stories.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-black/5 bg-tg-secondary-bg p-5 shadow-sm dark:border-white/10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-tg-text">Истории идей</h2>
          </div>

          <div className="no-scrollbar -mx-1 flex overflow-x-auto px-1 pb-1 pr-4" style={{ gap: "1.5rem" }}>
            {stories.map(({ task, seen }) => {
              const parsedIdea = parseIdeaContent(task.content);
              const visual = getStoryVisual(task.id);
              const resolvedStoryIcon = parsedIdea.icon ? resolveFolderIconGlyph(parsedIdea.icon) : visual.icon;
              const storyIcon = isMaterialIconGlyph(resolvedStoryIcon) ? resolvedStoryIcon : visual.icon;

              return (
                <button
                  key={`story-${task.id}`}
                  type="button"
                  onClick={() => handleStoryOpen(task.id)}
                  className="group relative flex shrink-0 flex-col items-center transition-transform active:scale-95"
                  style={{ width: "88px" }}
                >
                  <div
                    className={`relative flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(45deg,#f09433_0%,#e6683c_25%,#dc2743_50%,#cc2366_75%,#bc1888_100%)] p-[3px] transition-opacity ${seen ? "opacity-55" : "opacity-100"}`}
                  >
                    <div className="h-full w-full overflow-hidden rounded-full bg-white p-[2px] dark:bg-gray-800">
                      <div className="flex h-full w-full items-center justify-center rounded-full" style={{ background: visual.gradient }}>
                        <FolderIcon icon={storyIcon} className="leading-none text-white" style={{ fontSize: "40px" }} />
                      </div>
                    </div>
                  </div>
                  <span
                    className={`mt-2 block w-full truncate px-1 text-center font-medium leading-tight ${seen ? "text-tg-hint" : "text-tg-text"}`}
                    style={{ fontSize: "11px" }}
                  >
                    {parsedIdea.shortTitle || "Идея"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Drawer.Root
        fixed
        repositionInputs={false}
        open={storyPreviewOpen}
        onOpenChange={(open) => {
          setStoryPreviewOpen(open);
          if (!open) {
            setActiveStoryId(null);
          }
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[32px] bg-tg-secondary-bg p-5 shadow-2xl">
            <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-tg-hint/20" />

            {activeStory ? (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-tg-hint uppercase tracking-wider">
                      Идея {activeStoryIndex + 1} из {stories.length}
                    </span>
                    {!activeStory.seen && (
                      <span className="rounded-full bg-soft-orange/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-soft-orange">
                        Новая
                      </span>
                    )}
                  </div>

                  <h3 className="text-2xl font-bold leading-tight text-tg-text">
                    {parseIdeaContent(activeStory.task.content).fullTitle || "Без названия"}
                  </h3>

                  <div className="mt-3 text-base leading-relaxed text-tg-hint line-clamp-4">
                    {parseIdeaContent(activeStory.task.content).text}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleStoryStep(1)}
                    className="flex h-14 items-center justify-center rounded-2xl bg-tg-bg text-base font-semibold text-tg-text transition-colors active:bg-black/5"
                  >
                    Дальше
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenStoryDetail}
                    className="flex h-14 items-center justify-center rounded-2xl bg-tg-button text-base font-semibold text-tg-button-text shadow-sm transition-transform active:scale-[0.98]"
                  >
                    Открыть
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-tg-hint">Идея не найдена</div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {searchQuery.trim() && (
        <div className="mb-5 rounded-2xl bg-tg-secondary-bg p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tg-hint">
            Результаты: {searchResults.length}
          </p>
          {!searchResults.length && <p className="text-sm text-tg-hint">Ничего не найдено</p>}
          {!!searchResults.length && (
            <ul className="space-y-2">
              {searchResults.map((task) => (
                <li key={task.id} className="rounded-xl bg-tg-bg p-3 text-sm text-tg-text line-clamp-3">
                  {highlightText(task.content, searchQuery).map((part, index) => (
                    <span
                      key={`${task.id}-${index}`}
                      className={part.highlighted ? "rounded bg-soft-orange/40 px-0.5" : undefined}
                    >
                      {part.text}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-tg-hint">Папки · {folders.length}</h2>
        <button
          type="button"
          onClick={() => setSubView({ type: "manage" })}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-tg-secondary-bg px-2.5 text-xs font-medium text-tg-hint"
        >
          <span className="material-symbols-outlined text-sm">edit</span>
          Управлять
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl bg-tg-secondary-bg" />
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          {folders.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {folders.map((folder) => {
                const meta = getFolderMeta(folder.slug, folders);
                const iconBg = toAlphaColor(meta.color, 0.14);
                const taskCount = countByFolder(tasks, folder.slug);

                return (
                  <button
                    key={folder.slug}
                    type="button"
                    onClick={() => setSubView({ type: "folder", folder: folder.slug })}
                    className="flex aspect-square cursor-pointer flex-col justify-between rounded-2xl bg-tg-secondary-bg p-5 text-left transition-transform active:scale-95"
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: iconBg }}
                      >
                        <FolderIcon icon={meta.icon} className="text-xl leading-none" style={{ color: meta.color }} />
                      </div>
                      <span className="rounded-lg bg-black/5 px-2 py-0.5 text-xs font-semibold text-tg-hint">
                        {taskCount}
                      </span>
                    </div>
                    <div>
                      <p className="truncate font-medium text-tg-text">{meta.displayName}</p>
                      <p className="mt-0.5 truncate text-xs text-tg-hint">{meta.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setSubView({ type: "archive" })}
        className="mt-5 flex w-full cursor-pointer items-center justify-between rounded-2xl bg-tg-secondary-bg p-4 text-left transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/5">
            <span className="material-symbols-outlined text-xl text-icon-muted">archive</span>
          </div>
          <div>
            <p className="text-sm font-medium text-tg-text">Архив</p>
            <p className="text-xs text-tg-hint">Завершённые задачи</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-tg-hint">{archivedCount}</span>
          <span className="material-symbols-outlined text-lg text-icon-muted">chevron_right</span>
        </div>
      </button>
    </section>
  );
}
