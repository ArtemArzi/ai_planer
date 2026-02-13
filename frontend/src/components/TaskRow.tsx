import { useEffect, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import type { Task } from "../api/tasks";
import { useUpdateTask } from "../api/tasks";
import { DeadlineIndicator } from "./DeadlineIndicator";
import { FolderBadge } from "./FolderBadge";
import { useHaptic } from "../hooks/useHaptic";
import { useUIStore } from "../stores/uiStore";

type TaskRowProps = {
  task: Task;
  dragControls?: ReturnType<typeof useDragControls>;
};

export function TaskRow({ task, dragControls }: TaskRowProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const updateTask = useUpdateTask();
  const pendingUndos = useUIStore((state) => state.pendingUndos);
  const addPendingUndo = useUIStore((state) => state.addPendingUndo);
  const removePendingUndo = useUIStore((state) => state.removePendingUndo);
  const openTaskDetail = useUIStore((state) => state.openTaskDetail);
  const haptic = useHaptic();

  useEffect(() => {
    setIsCompleting(pendingUndos.has(task.id));
  }, [pendingUndos, task.id]);

  const showCelebration = () => {
    const element = document.getElementById(`task-${task.id}`);
    if (!element) return;
    element.classList.add("celebrate");
    setTimeout(() => element.classList.remove("celebrate"), 600);
  };

  const handleComplete = () => {
    if (isCompleting) {
      removePendingUndo(task.id);
      setIsCompleting(false);
      return;
    }

    setIsCompleting(true);
    haptic.notification("success");
    showCelebration();

    const timerId = setTimeout(() => {
      updateTask.mutate({ id: task.id, updates: { status: "done" } });
      removePendingUndo(task.id);
      setIsCompleting(false);
    }, 2000);

    addPendingUndo(
      {
        taskId: task.id,
        type: "complete",
        previousState: { status: task.status },
        createdAt: Date.now(),
      },
      timerId as unknown as ReturnType<typeof globalThis.setTimeout>,
    );
  };

  const handleTap = () => {
    if (!isCompleting) openTaskDetail(task.id);
  };

  return (
    <motion.div
      layout
      transition={{ layout: { type: "spring", stiffness: 400, damping: 30 } }}
      id={`task-${task.id}`}
      className={`flex items-center gap-3 rounded-2xl bg-tg-secondary-bg p-4 ${isCompleting ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-label={isCompleting ? "Отменить" : "Выполнить"}
        onClick={handleComplete}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
            isCompleting ? "border-green-500 bg-green-500" : "border-tg-hint"
          }`}
        >
          {isCompleting && <span className="material-symbols-outlined text-sm text-white">check</span>}
        </span>
      </button>

      <button type="button" onClick={handleTap} className="flex-1 text-left">
        <p className={`text-tg-text line-clamp-3 ${isCompleting ? "line-through" : ""}`}>{task.content}</p>
        <div className="mt-1 flex items-center gap-2">
          {task.deadline && <DeadlineIndicator deadline={task.deadline} size="sm" />}
        </div>
      </button>

      <FolderBadge folder={task.folder} size="sm" />

      <span
        className="material-symbols-outlined cursor-grab touch-none text-lg text-icon-muted active:cursor-grabbing"
        onPointerDown={(e) => {
          useUIStore.getState().setIsDraggingTask(true);
          dragControls?.start(e);
        }}
        onPointerUp={() => useUIStore.getState().setIsDraggingTask(false)}
        onPointerCancel={() => useUIStore.getState().setIsDraggingTask(false)}
      >
        drag_indicator
      </span>
    </motion.div>
  );
}
