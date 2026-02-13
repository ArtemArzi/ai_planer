import { memo, useCallback } from "react";
import type { Task } from "../api/tasks";

type IdeaCardProps = {
  task: Task;
  onTap?: (taskId: string) => void;
};

function IdeaCardComponent({ task, onTap }: IdeaCardProps) {
  const handleTap = useCallback(() => onTap?.(task.id), [onTap, task.id]);

  return (
    <button
      type="button"
      className="w-full rounded-2xl bg-tg-secondary-bg p-4 text-left transition-colors active:bg-tg-secondary-bg/80"
      onClick={handleTap}
    >
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-tg-bg px-2.5 py-1 text-xs text-tg-hint">
        <span className="material-symbols-outlined text-sm">lightbulb</span>
        Идея
      </span>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-tg-text line-clamp-3">
        {task.content}
      </p>
    </button>
  );
}

export const IdeaCard = memo(IdeaCardComponent);
