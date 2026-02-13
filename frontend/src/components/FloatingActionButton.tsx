import { useUIStore } from "../stores/uiStore";

export function FloatingActionButton() {
  const openSheet = useUIStore((state) => state.openSheet);
  const openAddTask = useUIStore((state) => state.openAddTask);

  if (openSheet) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={openAddTask}
      aria-label="Добавить задачу"
      className="fixed bottom-24 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-tg-button text-tg-button-text shadow-xl transition-transform active:scale-95"
    >
      <span className="material-symbols-outlined text-2xl">add</span>
    </button>
  );
}
