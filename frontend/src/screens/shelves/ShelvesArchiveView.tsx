import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { Task } from "../../api/tasks";

const pageTransition = {
  initial: { x: 40, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -20, opacity: 0 },
  transition: { type: "tween", ease: [0.25, 0.1, 0.25, 1], duration: 0.2 },
};

type ShelvesArchiveViewProps = {
  archivedTasks: Task[];
  archivedCount: number;
  onBack: () => void;
  onRestoreTask: (taskId: string) => void;
  onDragEnd: (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
};

export function ShelvesArchiveView({
  archivedTasks,
  archivedCount,
  onBack,
  onRestoreTask,
  onDragEnd,
}: ShelvesArchiveViewProps) {
  const PAGE_SIZE = 40;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [archivedTasks.length]);

  const visibleTasks = useMemo(() => archivedTasks.slice(0, visibleCount), [archivedTasks, visibleCount]);
  const hasMore = visibleTasks.length < archivedTasks.length;

  return (
    <AnimatePresence mode="wait">
      <motion.section
        key="archive"
        className="mx-auto w-full max-w-lg px-5 pb-36 pt-6"
        {...pageTransition}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.4 }}
        onDragEnd={onDragEnd}
      >
        <header className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
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
            {visibleTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-2xl bg-tg-secondary-bg p-4"
              >
                <p className="flex-1 text-sm text-tg-text line-through opacity-60 line-clamp-3">{task.content}</p>
                <button
                  type="button"
                  onClick={() => onRestoreTask(task.id)}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-tg-bg px-3 text-xs font-medium text-tg-link"
                >
                  <span className="material-symbols-outlined text-base">undo</span>
                  Вернуть
                </button>
              </li>
            ))}
            {hasMore && (
              <li>
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="w-full rounded-xl bg-tg-bg px-4 py-3 text-sm font-medium text-tg-link"
                >
                  Показать еще
                </button>
              </li>
            )}
          </ul>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
