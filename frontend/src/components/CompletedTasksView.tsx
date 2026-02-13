import { useMemo } from "react";
import { useTasks, useUpdateTask } from "../api/tasks";

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  return date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function CompletedTasksView() {
  const { data: tasks = [], isLoading } = useTasks({ status: "done", limit: 200 });
  const updateTask = useUpdateTask();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof tasks>();

    for (const task of tasks) {
      const completedAt = task.completedAt ?? task.updatedAt;
      const key = dayKey(completedAt);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, task]);
    }

    return Array.from(map.entries()).sort(([a], [b]) => (a > b ? -1 : 1));
  }, [tasks]);

  if (isLoading) {
    return (
      <section className="px-5 pb-6">
        <div className="h-16 animate-pulse rounded-2xl bg-tg-secondary-bg" />
      </section>
    );
  }

  if (!tasks.length) {
    return (
      <section className="px-5 pb-6">
        <div className="rounded-2xl bg-tg-secondary-bg p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-soft-green/20">
            <span className="material-symbols-outlined text-2xl text-soft-green">check_circle</span>
          </div>
          <p className="font-medium text-tg-text">Завершённых задач пока нет</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 px-5 pb-6">
      <p className="text-xs text-tg-hint">Выполненные задачи автоматически архивируются через 7 дней.</p>

      {grouped.map(([key, items]) => (
        <div key={key} className="rounded-2xl bg-tg-secondary-bg p-4">
          <h4 className="mb-3 text-sm font-semibold text-tg-text">{formatDayLabel(key)}</h4>

          <ul className="space-y-2">
            {items.map((task) => (
              <li key={task.id} className="flex items-center gap-3 rounded-xl bg-tg-bg px-4 py-3">
                <p className="flex-1 text-sm text-tg-text line-through opacity-70">{task.content}</p>
                <button
                  type="button"
                  onClick={() => updateTask.mutate({ id: task.id, updates: { status: "active", completedAt: null } })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-tg-secondary-bg px-3 text-xs font-medium text-tg-link"
                >
                  <span className="material-symbols-outlined text-base">undo</span>
                  Вернуть
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
