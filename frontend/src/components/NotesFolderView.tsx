import { NoteCard } from "./NoteCard";
import { useTasks } from "../api/tasks";

export function NotesFolderView() {
  const { data: tasks = [], isLoading } = useTasks({ folder: "notes", limit: 200 });
  const notes = tasks.filter((task) => task.type === "note");

  if (isLoading) {
    return (
      <section className="px-4 pb-6">
        <div className="h-24 animate-pulse rounded-2xl bg-tg-secondary-bg" />
      </section>
    );
  }

  if (!notes.length) {
    return (
      <section className="px-4 pb-6">
        <div className="rounded-2xl bg-tg-secondary-bg/60 p-6 text-center">
          <p className="font-medium text-tg-text">Папка заметок пуста</p>
          <p className="mt-1 text-sm text-tg-hint">Совет: длинные сообщения автоматически сохраняются как заметки.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2 px-4 pb-6">
      {notes.map((task) => (
        <NoteCard key={task.id} task={task} />
      ))}
    </section>
  );
}
