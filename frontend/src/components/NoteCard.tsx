import { useMemo } from "react";
import type { Task } from "../api/tasks";

type NoteCardProps = {
  task: Task;
  onTap?: (taskId: string) => void;
};

function splitTitleBody(content: string): { title: string; body: string } {
  const newline = content.indexOf("\n");
  if (newline === -1) {
    return { title: content, body: "" };
  }
  return {
    title: content.slice(0, newline).trim(),
    body: content.slice(newline + 1).trim(),
  };
}

export function NoteCard({ task, onTap }: NoteCardProps) {
  const { title, body } = useMemo(() => splitTitleBody(task.content), [task.content]);

  return (
    <button
      type="button"
      className="w-full rounded-2xl bg-tg-secondary-bg p-4 text-left transition-colors active:bg-tg-secondary-bg/80"
      onClick={() => onTap?.(task.id)}
    >
      <p className="text-sm font-semibold text-tg-text line-clamp-1">{title}</p>
      {body && (
        <p className="mt-0.5 text-xs text-tg-hint line-clamp-1">{body}</p>
      )}
    </button>
  );
}
