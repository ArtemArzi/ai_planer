import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInboxTasks, useUpdateTask } from "../api/tasks";
import { useHaptic } from "../hooks/useHaptic";
import { useUIStore } from "../stores/uiStore";
import { CardStack } from "./CardStack";

type SwipeDirection = "left" | "right" | "up" | "down";

const SWIPE_HINT_KEY = "swipe_hint_shown";

export function InboxStack() {
  const { data: tasks = [], isLoading } = useInboxTasks();
  const updateTask = useUpdateTask();
  const addPendingUndo = useUIStore((state) => state.addPendingUndo);
  const removePendingUndo = useUIStore((state) => state.removePendingUndo);
  const openCalendarSheet = useUIStore((state) => state.openCalendarSheet);
  const haptic = useHaptic();

  const [showHint, setShowHint] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !window.localStorage.getItem(SWIPE_HINT_KEY);
  });

  const hasCards = tasks.length > 0;
  const isOverflowing = tasks.length > 10;

  const handleSwipe = useCallback((taskId: string, direction: SwipeDirection) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    if (direction !== "up") {
      const timerId = setTimeout(() => {
        removePendingUndo(taskId);
      }, 2000);

      addPendingUndo(
        {
          taskId,
          type: direction === "down" ? "delete" : "move",
          previousState: { status: task.status },
          createdAt: Date.now(),
        },
        timerId,
      );
    }

    switch (direction) {
      case "right":
        updateTask.mutate({ id: taskId, updates: { status: "active" } });
        break;
      case "left":
        updateTask.mutate({ id: taskId, updates: { status: "backlog" } });
        break;
      case "down":
        updateTask.mutate({ id: taskId, updates: { status: "deleted" } });
        break;
      case "up":
        openCalendarSheet(taskId);
        break;
    }
  }, [addPendingUndo, openCalendarSheet, removePendingUndo, tasks, updateTask]);

  const handlePostponeAll = useCallback(async () => {
    if (!tasks.length) {
      return;
    }

    haptic.impact("heavy");

    await Promise.all(
      tasks.map((task) =>
        updateTask.mutateAsync({
          id: task.id,
          updates: { status: "backlog" },
        }),
      ),
    );
  }, [haptic, tasks, updateTask]);

  return (
    <AnimatePresence>
      {isLoading && (
        <section className="mb-6 px-5">
          <div className="mb-2 h-4 w-16 animate-pulse rounded bg-tg-secondary-bg" />
          <div className="h-24 animate-pulse rounded-2xl bg-tg-secondary-bg" />
        </section>
      )}

      {!isLoading && !hasCards && (
        <section className="mb-6 px-5">
          <div className="rounded-2xl bg-tg-secondary-bg p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-soft-green/20">
              <span className="material-symbols-outlined text-2xl text-soft-green">check_circle</span>
            </div>
            <p className="font-semibold text-tg-text">Inbox пуст</p>
            <p className="mt-1 text-sm text-tg-hint">
              Отправьте сообщение боту, чтобы добавить задачу
            </p>
          </div>
        </section>
      )}

      {hasCards && showHint && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mb-3 px-5"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-soft-blue/10 p-4 text-sm text-tg-text">
            <span className="material-symbols-outlined text-xl text-soft-blue">swipe</span>
            <span className="flex-1">Свайп → в план, ← позже, ↑ дата, ↓ удалить</span>
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(SWIPE_HINT_KEY, "true");
                setShowHint(false);
              }}
              className="font-medium text-soft-blue"
            >
              Ок
            </button>
          </div>
        </motion.div>
      )}

      {hasCards && (
        <motion.section
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <h2 className="mb-3 px-5 text-xs font-semibold uppercase tracking-widest text-tg-hint">
            Inbox · {tasks.length}
          </h2>

          {isOverflowing && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              type="button"
              onClick={handlePostponeAll}
              className="mx-5 mb-4 flex h-12 w-[calc(100%-2.5rem)] items-center justify-center gap-2 rounded-2xl bg-soft-orange/20 font-medium text-soft-orange"
            >
              <span className="material-symbols-outlined text-xl">schedule</span>
              Отложить все ({tasks.length})
            </motion.button>
          )}

          <CardStack tasks={tasks} onSwipe={handleSwipe} />

          <div className="mt-4 flex justify-between px-5 text-icon-muted">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-base">schedule</span>
              Позже
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-base">event</span>
              Дата
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-base">check</span>
              В план
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
