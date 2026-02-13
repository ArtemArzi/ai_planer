import { AnimatePresence, motion } from "framer-motion";
import { useUpdateTask } from "../api/tasks";
import { useUIStore } from "../stores/uiStore";

function getActionText(type: "complete" | "delete" | "move"): string {
  switch (type) {
    case "complete":
      return "Задача завершена";
    case "delete":
      return "Задача удалена";
    case "move":
      return "Задача перемещена";
  }
}

export function Snackbar() {
  const latestUndoTaskId = useUIStore((state) => state.latestUndoTaskId);
  const pendingUndos = useUIStore((state) => state.pendingUndos);
  const removePendingUndo = useUIStore((state) => state.removePendingUndo);
  const updateTask = useUpdateTask();

  const latestAction = latestUndoTaskId ? pendingUndos.get(latestUndoTaskId) : undefined;
  const showUndoAll = pendingUndos.size > 1;

  const handleUndoLatest = () => {
    if (!latestUndoTaskId) {
      return;
    }

    const action = removePendingUndo(latestUndoTaskId);
    if (!action) {
      return;
    }

    updateTask.mutate({
      id: action.taskId,
      updates: action.previousState,
    });
  };

  const handleUndoAll = () => {
    const keys = Array.from(pendingUndos.keys());

    for (const taskId of keys) {
      const action = removePendingUndo(taskId);
      if (!action) {
        continue;
      }

      updateTask.mutate({
        id: action.taskId,
        updates: action.previousState,
      });
    }
  };

  return (
    <AnimatePresence>
      {latestAction && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          className="fixed inset-x-4 bottom-24 z-50 rounded-xl bg-tg-secondary-bg p-3 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm text-tg-text">{getActionText(latestAction.type)}</p>
            <button
              type="button"
              className="h-11 rounded-lg px-2 text-sm font-semibold text-tg-link"
              onClick={handleUndoLatest}
            >
              Отменить
            </button>
            {showUndoAll && (
              <button
                type="button"
                className="h-11 rounded-lg px-2 text-sm font-semibold text-tg-link"
                onClick={handleUndoAll}
              >
                Отменить все
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
