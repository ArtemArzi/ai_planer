import { useState, useEffect, useMemo } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { TaskRow } from "./TaskRow";
import { useTodayTasks, type Task } from "../api/tasks";
import { useUIStore } from "../stores/uiStore";

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

export function TodayList() {
  const { data: rawTasks = [], isLoading } = useTodayTasks();
  const tasks = useMemo(
    () => rawTasks.filter((t) => t.folder !== "notes" && t.folder !== "ideas"),
    [rawTasks],
  );
  const [orderedTasks, setOrderedTasks] = useState<Task[]>([]);

  useEffect(() => {
    setOrderedTasks((previous) => {
      if (!previous.length && tasks.length === 0) {
        return previous;
      }

      if (
        previous.length === tasks.length
        && previous.every((task, index) => task.id === tasks[index]?.id)
      ) {
        return previous;
      }

      if (!previous.length) {
        return tasks;
      }

      const byId = new Map(tasks.map((task) => [task.id, task]));
      const kept = previous
        .map((task) => byId.get(task.id))
        .filter((task): task is Task => task !== undefined);
      const added = tasks.filter((task) => !kept.some((current) => current.id === task.id));

      return [...kept, ...added];
    });
  }, [tasks]);

  if (isLoading) {
    return (
      <section className="mb-6 px-5">
        <div className="mb-2 h-4 w-20 animate-pulse rounded bg-tg-secondary-bg" />
        <div className="h-16 animate-pulse rounded-xl bg-tg-secondary-bg" />
      </section>
    );
  }

  if (!orderedTasks.length) {
    return (
      <section className="mb-6 px-5">
        <div className="rounded-2xl bg-tg-secondary-bg/50 p-5 text-center">
          <p className="font-medium text-tg-text">На сегодня задач нет</p>
          <p className="mt-1 text-sm text-tg-hint">Свайпните задачу вправо из Inbox или нажмите +</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 px-5 text-xs font-semibold uppercase tracking-widest text-tg-hint">
        Сегодня · {orderedTasks.length}
      </h2>
      <Reorder.Group
        axis="y"
        values={orderedTasks}
        onReorder={setOrderedTasks}
        className="space-y-2 px-5"
      >
        {orderedTasks.map((task) => (
          <ReorderableTask key={task.id} task={task} />
        ))}
      </Reorder.Group>
    </section>
  );
}
