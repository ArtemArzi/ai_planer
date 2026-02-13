import { useMemo, useState } from "react";
import { useUpcomingTasks, type Task } from "../api/tasks";
import { useUIStore } from "../stores/uiStore";
import { useHaptic } from "../hooks/useHaptic";
import { FolderBadge } from "./FolderBadge";

type UpcomingGroup = {
  key: "tomorrow" | "thisWeek" | "later";
  label: string;
  items: Task[];
};

function toStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiffFromToday(targetDate: string): number {
  const [year, month, day] = targetDate.split("-").map(Number);
  const target = toStartOfDay(new Date(year, month - 1, day));
  const today = toStartOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function formatScheduledDate(scheduledDate: string, scheduledTime: string | null): string {
  const [year, month, day] = scheduledDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dateLabel = date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  if (!scheduledTime) {
    return dateLabel;
  }

  return `${dateLabel}, ${scheduledTime}`;
}

function buildGroups(tasks: Task[]): UpcomingGroup[] {
  const tomorrow: Task[] = [];
  const thisWeek: Task[] = [];
  const later: Task[] = [];

  for (const task of tasks) {
    if (!task.scheduledDate) {
      later.push(task);
      continue;
    }

    const diff = dayDiffFromToday(task.scheduledDate);
    if (diff === 1) {
      tomorrow.push(task);
    } else if (diff > 1 && diff <= 7) {
      thisWeek.push(task);
    } else {
      later.push(task);
    }
  }

  const groups: UpcomingGroup[] = [
    { key: "tomorrow", label: "Завтра", items: tomorrow },
    { key: "thisWeek", label: "На неделе", items: thisWeek },
    { key: "later", label: "Позже", items: later },
  ];

  return groups.filter((group) => group.items.length > 0);
}

export function UpcomingList() {
  const { data: rawTasks = [], isLoading } = useUpcomingTasks();
  const tasks = useMemo(
    () => rawTasks.filter((t) => t.folder !== "notes" && t.folder !== "ideas"),
    [rawTasks],
  );
  const openTaskDetail = useUIStore((state) => state.openTaskDetail);
  const haptic = useHaptic();
  const [expanded, setExpanded] = useState(true);

  const groups = useMemo(() => buildGroups(tasks), [tasks]);

  if (isLoading) {
    return (
      <section className="mb-6 px-5">
        <div className="mb-2 h-4 w-24 animate-pulse rounded bg-tg-secondary-bg" />
        <div className="h-14 animate-pulse rounded-xl bg-tg-secondary-bg" />
      </section>
    );
  }

  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="mb-6 px-5">
      <button
        type="button"
        onClick={() => {
          setExpanded((value) => !value);
          haptic.selection();
        }}
        className="flex w-full items-center justify-between rounded-xl bg-tg-secondary-bg/70 px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-tg-hint">Запланировано · {tasks.length}</span>
        <span className="material-symbols-outlined text-tg-hint">{expanded ? "expand_less" : "expand_more"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-tg-hint">{group.label}</h3>
              <ul className="space-y-2">
                {group.items.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => openTaskDetail(task.id)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-tg-secondary-bg p-4 text-left"
                    >
                      <div className="flex-1">
                        <p className="text-sm text-tg-text line-clamp-3">{task.content}</p>
                        {task.scheduledDate && (
                          <p className="mt-1 text-xs text-tg-hint">
                            {formatScheduledDate(task.scheduledDate, task.scheduledTime)}
                          </p>
                        )}
                      </div>
                      <FolderBadge folder={task.folder} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
