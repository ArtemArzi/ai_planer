import { create } from "zustand";
import type { Task } from "../api/tasks";

type UndoType = "complete" | "delete" | "move";
type SwipeDirection = "left" | "right" | "up" | "down";
type SheetName = "taskDetail" | "calendar" | "addTask" | "settings";

export type UndoAction = {
  taskId: string;
  type: UndoType;
  previousState: Partial<Task>;
  timerId: unknown;
  createdAt: number;
};

type UIStore = {
  activeTab: "focus" | "shelves";
  setActiveTab: (tab: "focus" | "shelves") => void;

  pendingUndos: Map<string, UndoAction>;
  latestUndoTaskId: string | null;
  addPendingUndo: (
    action: Omit<UndoAction, "timerId">,
    timerId: unknown,
  ) => void;
  removePendingUndo: (taskId: string) => UndoAction | undefined;
  clearAllPendingUndos: () => void;

  swipingTaskId: string | null;
  swipeDirection: SwipeDirection | null;
  setSwipeState: (taskId: string | null, direction: SwipeDirection | null) => void;

  openSheet: SheetName | null;
  selectedTaskId: string | null;
  openTaskDetail: (taskId: string) => void;
  openCalendarSheet: (taskId: string) => void;
  openAddTask: () => void;
  openSettings: () => void;
  closeSheet: () => void;

  isDraggingTask: boolean;
  setIsDraggingTask: (dragging: boolean) => void;

  sunsetCount: number | null;
  setSunsetCount: (count: number | null) => void;
};

export const useUIStore = create<UIStore>((set, get) => ({
  activeTab: "focus",
  setActiveTab: (tab) => set({ activeTab: tab }),

  pendingUndos: new Map(),
  latestUndoTaskId: null,
  addPendingUndo: (action, timerId) =>
    set((state) => {
      const nextMap = new Map(state.pendingUndos);
      nextMap.set(action.taskId, { ...action, timerId });

      return {
        pendingUndos: nextMap,
        latestUndoTaskId: action.taskId,
      };
    }),
  removePendingUndo: (taskId) => {
    const state = get();
    const action = state.pendingUndos.get(taskId);

    if (action) {
      clearTimeout(action.timerId as number);

      const nextMap = new Map(state.pendingUndos);
      nextMap.delete(taskId);

      const keys = Array.from(nextMap.keys());
      const latestKey = keys.length > 0 ? keys[keys.length - 1] : null;

      set({
        pendingUndos: nextMap,
        latestUndoTaskId: latestKey,
      });
    }

    return action;
  },
  clearAllPendingUndos: () => {
    const state = get();
    for (const action of state.pendingUndos.values()) {
      clearTimeout(action.timerId as number);
    }

    set({
      pendingUndos: new Map(),
      latestUndoTaskId: null,
    });
  },

  swipingTaskId: null,
  swipeDirection: null,
  setSwipeState: (taskId, direction) =>
    set({
      swipingTaskId: taskId,
      swipeDirection: direction,
    }),

  openSheet: null,
  selectedTaskId: null,
  openTaskDetail: (taskId) => set({ openSheet: "taskDetail", selectedTaskId: taskId }),
  openCalendarSheet: (taskId) => set({ openSheet: "calendar", selectedTaskId: taskId }),
  openAddTask: () => set({ openSheet: "addTask" }),
  openSettings: () => set({ openSheet: "settings" }),
  closeSheet: () =>
    set({
      openSheet: null,
      selectedTaskId: null,
    }),

  isDraggingTask: false,
  setIsDraggingTask: (dragging) => set({ isDraggingTask: dragging }),

  sunsetCount: null,
  setSunsetCount: (count) => set({ sunsetCount: count }),
}));

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const state = useUIStore.getState();
    const now = Date.now();

    for (const [taskId, action] of state.pendingUndos.entries()) {
      clearTimeout(action.timerId as number);

      const actionAge = now - action.createdAt;
      if (actionAge >= 2000) {
        navigator.sendBeacon?.(
          `/tasks/${taskId}`,
          JSON.stringify({
            status: "done",
            completedAt: Date.now(),
          }),
        );
      }
    }
  });
}
