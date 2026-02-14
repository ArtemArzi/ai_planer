import { memo, useCallback, type PointerEvent } from "react";
import { motion, useDragControls } from "framer-motion";
import type { Task } from "../api/tasks";
import { useUpdateTask } from "../api/tasks";
import { DeadlineIndicator } from "./DeadlineIndicator";
import { FolderBadge } from "./FolderBadge";
import { useHaptic } from "../hooks/useHaptic";
import { useUIStore } from "../stores/uiStore";
import { TapMotion } from "./TapMotion";

type TaskRowProps = {
  task: Task;
  dragControls?: ReturnType<typeof useDragControls>;
  enableLayoutAnimation?: boolean;
};

function TaskRowComponent({ task, dragControls, enableLayoutAnimation = true }: TaskRowProps) {
  const updateTask = useUpdateTask();
  const isCompleting = useUIStore((state) => state.pendingUndos.has(task.id));
  const addPendingUndo = useUIStore((state) => state.addPendingUndo);
  const removePendingUndo = useUIStore((state) => state.removePendingUndo);
  const openTaskDetail = useUIStore((state) => state.openTaskDetail);
  const setIsDraggingTask = useUIStore((state) => state.setIsDraggingTask);
  const haptic = useHaptic();
  const isDone = task.status === "done" || task.status === "archived";
  const isCompletedVisual = isCompleting || isDone;

  const showCelebration = useCallback(() => {
    const element = document.getElementById(`task-${task.id}`);
    if (!element) return;
    element.classList.add("celebrate");
    setTimeout(() => element.classList.remove("celebrate"), 600);
  }, [task.id]);

  const handleComplete = useCallback(() => {
    if (isDone) {
      return;
    }

    if (isCompleting) {
      removePendingUndo(task.id);
      return;
    }

    haptic.notification("success");
    showCelebration();

    const timerId = setTimeout(() => {
      updateTask.mutate({ id: task.id, updates: { status: "done" } });
      removePendingUndo(task.id);
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
  }, [
    addPendingUndo,
    haptic,
    isCompleting,
    isDone,
    removePendingUndo,
    showCelebration,
    task.id,
    task.status,
    updateTask,
  ]);

  const handleTap = useCallback(() => {
    if (!isCompleting) openTaskDetail(task.id);
  }, [isCompleting, openTaskDetail, task.id]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLSpanElement>) => {
    setIsDraggingTask(true);
    dragControls?.start(e);
  }, [dragControls, setIsDraggingTask]);

  const handlePointerUp = useCallback(() => {
    setIsDraggingTask(false);
  }, [setIsDraggingTask]);

  return (
    <motion.div
      layout={enableLayoutAnimation}
      transition={enableLayoutAnimation ? { layout: { type: "spring", stiffness: 320, damping: 34 } } : undefined}
      id={`task-${task.id}`}
      className={`flex items-center gap-3 rounded-2xl bg-tg-secondary-bg p-4 ${isCompletedVisual ? "opacity-60" : ""}`}
    >
      <TapMotion>
        <button
          type="button"
          aria-label={isDone ? "Выполнено" : isCompleting ? "Отменить" : "Выполнить"}
          onClick={handleComplete}
          disabled={isDone}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full ${isDone ? "cursor-default" : ""}`}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
              isCompletedVisual ? "border-green-500 bg-green-500" : "border-tg-hint"
            }`}
          >
            {isCompletedVisual && <span className="material-symbols-outlined text-sm text-white">check</span>}
          </span>
        </button>
      </TapMotion>

      <TapMotion className="flex-1">
        <button type="button" onClick={handleTap} className="w-full text-left">
          <p className={`text-tg-text line-clamp-3 ${isCompletedVisual ? "line-through" : ""}`}>{task.content}</p>
          <div className="mt-1 flex items-center gap-2">
            {task.deadline && <DeadlineIndicator deadline={task.deadline} size="sm" />}
          </div>
        </button>
      </TapMotion>

      <FolderBadge folder={task.folder} size="sm" />

      <span
        className="material-symbols-outlined cursor-grab touch-none text-lg text-icon-muted active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        drag_indicator
      </span>
    </motion.div>
  );
}

export const TaskRow = memo(TaskRowComponent);
