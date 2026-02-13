import { Reorder, motion, type PanInfo, useDragControls } from "framer-motion";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { getFolderMeta, toAlphaColor, type FolderItem } from "../../api/folders";
import type { FolderSlug, Task } from "../../api/tasks";
import { NoteCard } from "../../components/NoteCard";
import { IdeaCard } from "../../components/IdeaCard";
import { FolderIcon } from "../../components/FolderIcon";
import { TaskRow } from "../../components/TaskRow";
import { useUIStore } from "../../stores/uiStore";
import { TapMotion } from "../../components/TapMotion";

function ReorderableTask({ task, enableLayoutAnimation }: { task: Task; enableLayoutAnimation: boolean }) {
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
      <TaskRow task={task} dragControls={controls} enableLayoutAnimation={enableLayoutAnimation} />
    </Reorder.Item>
  );
}

type ShelvesFolderViewProps = {
  folder: FolderSlug;
  folders: FolderItem[];
  displayTasks: Task[];
  onBack: () => void;
  onDragEnd: (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  setOrderedFolderTasks: Dispatch<SetStateAction<Task[]>>;
};

export function ShelvesFolderView({
  folder,
  folders,
  displayTasks,
  onBack,
  onDragEnd,
  setOrderedFolderTasks,
}: ShelvesFolderViewProps) {
  const PAGE_SIZE = 40;
  const config = getFolderMeta(folder, folders);
  const iconBg = toAlphaColor(config.color, 0.14);
  const openTaskDetail = useUIStore((state) => state.openTaskDetail);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const isSimpleList = folder === "notes" || folder === "ideas";

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [folder, displayTasks.length]);

  const visibleSimpleTasks = useMemo(
    () => (isSimpleList ? displayTasks.slice(0, visibleCount) : displayTasks),
    [displayTasks, isSimpleList, visibleCount],
  );
  const hasMoreSimpleTasks = isSimpleList && visibleSimpleTasks.length < displayTasks.length;
  const enableLayoutAnimation = displayTasks.length <= 40;

  return (
    <motion.section
      className="mx-auto w-full max-w-lg px-5 pb-36 pt-6"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.4 }}
      onDragEnd={onDragEnd}
    >
      <header className="mb-5 flex items-center gap-3">
        <TapMotion>
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-tg-secondary-bg text-icon-muted"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
        </TapMotion>
        <div>
          <h1 className="text-xl font-bold text-tg-text">{config.displayName}</h1>
          <p className="text-sm text-tg-hint">{displayTasks.length} задач</p>
        </div>
      </header>

      {displayTasks.length === 0 && (
        <div className="rounded-2xl bg-tg-secondary-bg p-6 text-center">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: iconBg }}
          >
            <FolderIcon icon={config.icon} className="text-2xl leading-none" style={{ color: config.color }} />
          </div>
          <p className="font-medium text-tg-text">Пусто</p>
          <p className="mt-1 text-sm text-tg-hint">В этой папке пока нет задач</p>
        </div>
      )}

      {displayTasks.length > 0 && folder === "notes" && (
        <div className="space-y-2">
          {visibleSimpleTasks.map((task) => (
            <NoteCard key={task.id} task={task} onTap={openTaskDetail} />
          ))}
          {hasMoreSimpleTasks && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="w-full rounded-xl bg-tg-bg px-4 py-3 text-sm font-medium text-tg-link"
            >
              Показать еще
            </button>
          )}
        </div>
      )}

      {displayTasks.length > 0 && folder === "ideas" && (
        <div className="space-y-2">
          {visibleSimpleTasks.map((task) => (
            <IdeaCard key={task.id} task={task} onTap={openTaskDetail} />
          ))}
          {hasMoreSimpleTasks && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="w-full rounded-xl bg-tg-bg px-4 py-3 text-sm font-medium text-tg-link"
            >
              Показать еще
            </button>
          )}
        </div>
      )}

      {displayTasks.length > 0 && folder !== "notes" && folder !== "ideas" && (
        <Reorder.Group
          axis="y"
          values={displayTasks}
          onReorder={setOrderedFolderTasks}
          className="space-y-2"
        >
          {displayTasks.map((task) => (
            <ReorderableTask key={task.id} task={task} enableLayoutAnimation={enableLayoutAnimation} />
          ))}
        </Reorder.Group>
      )}
    </motion.section>
  );
}
