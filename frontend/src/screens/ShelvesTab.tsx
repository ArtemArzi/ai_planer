import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { PanInfo } from "framer-motion";
import { useFolders, getSystemFallbackFolders } from "../api/folders";
import { useTasks, useUpdateTask, type FolderSlug, type Task } from "../api/tasks";
import { useMe } from "../api/users";
import { useUIStore } from "../stores/uiStore";
import { FolderManageView } from "../components/FolderManageView";
import { markShelvesFirstOpenReady } from "../lib/perf";
import { ShelvesFolderView } from "./shelves/ShelvesFolderView";
import { ShelvesArchiveView } from "./shelves/ShelvesArchiveView";
import { ShelvesMainView } from "./shelves/ShelvesMainView";

const SWIPE_BACK_THRESHOLD = 30;
const STORIES_SEEN_STORAGE_PREFIX = "idea-stories-seen";

type SubView = { type: "folder"; folder: FolderSlug } | { type: "archive" } | { type: "manage" } | null;

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

  useEffect(() => {
    if (isLoading) {
      return;
    }

    markShelvesFirstOpenReady();
  }, [isLoading]);

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
    const displayTasks = orderedFolderTasks.length ? orderedFolderTasks : folderTasks;

    return (
      <ShelvesFolderView
        folder={subView.folder}
        folders={folders}
        displayTasks={displayTasks}
        onBack={() => setSubView(null)}
        onDragEnd={handleSwipeBack}
        setOrderedFolderTasks={setOrderedFolderTasks}
      />
    );
  }

  if (subView?.type === "manage") {
    return (
      <AnimatePresence mode="wait">
        <FolderManageView key="manage" onBack={() => setSubView(null)} />
      </AnimatePresence>
    );
  }

  if (subView?.type === "archive") {
    return (
      <ShelvesArchiveView
        archivedTasks={archivedTasks}
        archivedCount={archivedCount}
        onBack={() => setSubView(null)}
        onDragEnd={handleSwipeBack}
        onRestoreTask={(taskId) => updateTask.mutate({ id: taskId, updates: { status: "active", completedAt: null } })}
      />
    );
  }

  return (
    <ShelvesMainView
      tasks={tasks}
      folders={folders}
      isLoading={isLoading}
      searchQuery={searchQuery}
      searchResults={searchResults}
      storiesEnabled={storiesEnabled}
      stories={stories}
      storyPreviewOpen={storyPreviewOpen}
      activeStory={activeStory}
      activeStoryIndex={activeStoryIndex}
      archivedCount={archivedCount}
      onOpenSettings={openSettings}
      onSearchChange={setSearchQuery}
      onStoryOpen={handleStoryOpen}
      onStoryPreviewOpenChange={(open) => {
        setStoryPreviewOpen(open);
        if (!open) {
          setActiveStoryId(null);
        }
      }}
      onStoryStep={handleStoryStep}
      onOpenStoryDetail={handleOpenStoryDetail}
      onOpenManageView={() => setSubView({ type: "manage" })}
      onOpenFolderView={(folder) => setSubView({ type: "folder", folder })}
      onOpenArchiveView={() => setSubView({ type: "archive" })}
    />
  );
}
