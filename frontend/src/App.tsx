import { lazy, Suspense, useEffect, useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { FloatingActionButton } from "./components/FloatingActionButton";
import { Snackbar } from "./components/Snackbar";
import { TabBar } from "./components/TabBar";
import { TimezoneSync } from "./components/TimezoneSync";
import { AddTaskSheet } from "./components/sheets/AddTaskSheet";
import { useTasks, useUpdateTask } from "./api/tasks";
import { useGoogleCalendarCallbackSync } from "./api/google";
import { markColdStartFirstInteractivePaint, markTabSwitchRendered } from "./lib/perf";
import { FocusTab } from "./screens/FocusTab";
import { useUIStore } from "./stores/uiStore";

const ShelvesTab = lazy(() => import("./screens/ShelvesTab").then((module) => ({ default: module.ShelvesTab })));
const TaskDetailSheet = lazy(() => import("./components/sheets/TaskDetailSheet").then((module) => ({ default: module.TaskDetailSheet })));
const CalendarSheet = lazy(() => import("./components/sheets/CalendarSheet").then((module) => ({ default: module.CalendarSheet })));
const SettingsSheet = lazy(() => import("./components/sheets/SettingsSheet").then((module) => ({ default: module.SettingsSheet })));

const idle =
  typeof window !== "undefined" && "requestIdleCallback" in window
    ? window.requestIdleCallback.bind(window)
    : (callback: () => void) => window.setTimeout(callback, 120);

const TAB_SWIPE_THRESHOLD = 30;

const tabVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -20 : 20,
    opacity: 0,
  }),
};

const tabTransition = {
  type: "tween" as const,
  ease: [0.25, 0.1, 0.25, 1],
  duration: 0.2,
};

export function App() {
  useGoogleCalendarCallbackSync();

  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const isDraggingTask = useUIStore((state) => state.isDraggingTask);
  const setIsDraggingTask = useUIStore((state) => state.setIsDraggingTask);
  const openSheet = useUIStore((state) => state.openSheet);
  const selectedTaskId = useUIStore((state) => state.selectedTaskId);
  const closeSheet = useUIStore((state) => state.closeSheet);
  const shouldLoadDetailTasks = openSheet === "taskDetail" && Boolean(selectedTaskId);
  const { data: allTasks = [] } = useTasks({}, { enabled: shouldLoadDetailTasks });
  const updateTask = useUpdateTask();

  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const resetDragging = () => setIsDraggingTask(false);
    window.addEventListener("pointerup", resetDragging);
    window.addEventListener("pointercancel", resetDragging);
    return () => {
      window.removeEventListener("pointerup", resetDragging);
      window.removeEventListener("pointercancel", resetDragging);
    };
  }, [setIsDraggingTask]);

  useEffect(() => {
    markColdStartFirstInteractivePaint();
  }, []);

  useEffect(() => {
    idle(() => {
      void import("./screens/ShelvesTab");
      void import("./components/sheets/TaskDetailSheet");
      void import("./components/sheets/CalendarSheet");
      void import("./components/sheets/SettingsSheet");
    });
  }, []);

  useEffect(() => {
    markTabSwitchRendered(activeTab);
    if (activeTab === "shelves") {
      window.scrollTo(0, 0);
    }
  }, [activeTab]);

  const selectedTask = selectedTaskId ? allTasks.find((task) => task.id === selectedTaskId) ?? null : null;

  const handleCompleteTask = (taskId: string) => {
    updateTask.mutate({ id: taskId, updates: { status: "done" } });
    closeSheet();
  };

  const handleDeleteTask = (taskId: string) => {
    updateTask.mutate({ id: taskId, updates: { status: "deleted" } });
    closeSheet();
  };

  const switchTab = (tab: "focus" | "shelves") => {
    if (tab === activeTab) return;
    setDirection(tab === "shelves" ? 1 : -1);
    setActiveTab(tab, "swipe");
  };

  const handleTabSwipe = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (openSheet) return;
    if (isDraggingTask) return;
    if (Math.abs(info.offset.x) < Math.abs(info.offset.y)) return;
    const force = Math.abs(info.offset.x) + Math.abs(info.velocity.x) * 0.3;
    if (force > TAB_SWIPE_THRESHOLD && info.offset.x < 0 && activeTab === "focus") {
      switchTab("shelves");
    } else if (force > TAB_SWIPE_THRESHOLD && info.offset.x > 0 && activeTab === "shelves") {
      switchTab("focus");
    }
  };

  return (
    <main data-vaul-drawer-wrapper="" className="min-h-screen overflow-x-hidden bg-tg-bg text-tg-text">
      <motion.div
        className="relative"
        drag={openSheet ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.3, right: 0.3 }}
        onDragEnd={handleTabSwipe}
      >
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          {activeTab === "focus" ? (
            <motion.div
              key="focus"
              custom={direction}
              variants={tabVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={tabTransition}
              className="gpu-accelerated"
            >
              <FocusTab />
            </motion.div>
          ) : (
            <motion.div
              key="shelves"
              custom={direction}
              variants={tabVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={tabTransition}
              className="gpu-accelerated"
            >
              <Suspense fallback={<section className="mx-auto w-full max-w-lg px-5 pb-36 pt-6" />}>
                <ShelvesTab />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <FloatingActionButton />
      <Snackbar />
      <TabBar />
      <TimezoneSync />
      <AddTaskSheet open={openSheet === "addTask"} onOpenChange={(open) => !open && closeSheet()} />
      <Suspense fallback={null}>
        <SettingsSheet open={openSheet === "settings"} onOpenChange={(open) => !open && closeSheet()} />
        <TaskDetailSheet
          task={selectedTask}
          open={openSheet === "taskDetail"}
          onOpenChange={(open) => !open && closeSheet()}
          onComplete={handleCompleteTask}
          onDelete={handleDeleteTask}
        />
        <CalendarSheet
          taskId={selectedTaskId}
          open={openSheet === "calendar"}
          onOpenChange={(open) => !open && closeSheet()}
        />
      </Suspense>
    </main>
  );
}
