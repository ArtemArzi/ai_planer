import { useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";
import { getFolderMeta, getSystemFallbackFolders, useFolders } from "../../api/folders";
import { useCreateTask, type FolderSlug } from "../../api/tasks";
import { useHaptic } from "../../hooks/useHaptic";
import { FolderIcon } from "../FolderIcon";

type AddTaskSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function resolveDefaultFolder(slugs: string[]): FolderSlug {
  if (slugs.includes("personal")) {
    return "personal";
  }
  return slugs[0] ?? "personal";
}

export function AddTaskSheet({ open, onOpenChange }: AddTaskSheetProps) {
  const createTask = useCreateTask();
  const { data: folders = [] } = useFolders();
  const haptic = useHaptic();
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState<FolderSlug>("personal");
  const [deadlineInput, setDeadlineInput] = useState("");

  const displayFolders = useMemo(
    () => (folders.length > 0 ? folders : getSystemFallbackFolders()),
    [folders],
  );
  const folderSlugs = useMemo(() => displayFolders.map((item) => item.slug), [displayFolders]);
  const defaultFolder = useMemo(() => resolveDefaultFolder(folderSlugs), [folderSlugs]);

  useEffect(() => {
    if (folderSlugs.length === 0) {
      return;
    }
    if (!folderSlugs.includes(folder)) {
      setFolder(defaultFolder);
    }
  }, [defaultFolder, folder, folderSlugs]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const deadline = deadlineInput ? new Date(deadlineInput).getTime() : null;

    await createTask.mutateAsync({
      content: trimmed,
      folder,
      status: "active",
      deadline,
    });

    haptic.notification("success");
    setContent("");
    setFolder(defaultFolder);
    setDeadlineInput("");
    onOpenChange(false);
  };

  return (
    <Drawer.Root fixed repositionInputs={false} open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-tg-secondary-bg p-4"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-tg-hint/40" />
          <Drawer.Title className="text-lg font-semibold text-tg-text">Новая задача</Drawer.Title>

          <textarea
            data-vaul-no-drag
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Что нужно сделать?"
            className="mt-4 h-28 w-full resize-none rounded-xl border border-black/10 bg-white/70 p-3 text-sm text-tg-text outline-none"
          />

          <p className="mt-3 text-sm font-medium text-tg-text">Папка</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {displayFolders.map((item) => {
              const meta = getFolderMeta(item.slug, folders);
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setFolder(item.slug)}
                  className={`flex h-12 flex-col items-center justify-center rounded-xl text-xs ${
                    folder === item.slug ? "bg-tg-button text-tg-button-text" : "bg-white/70 text-tg-text"
                  }`}
                >
                  <FolderIcon icon={meta.icon} className="text-base leading-none" />
                  <span className="mt-0.5 truncate px-1">{meta.displayName}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-sm font-medium text-tg-text">Дедлайн (опционально)</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(event) => setDeadlineInput(event.target.value)}
              className="h-10 flex-1 rounded-xl border border-black/10 bg-white/70 px-3 text-sm text-tg-text outline-none"
            />
            {deadlineInput && (
              <button
                type="button"
                onClick={() => setDeadlineInput("")}
                className="flex h-10 items-center gap-1 rounded-xl bg-white/70 px-3 text-sm text-red-500"
              >
                <span className="material-symbols-outlined text-base">close</span>
                Сбросить
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={createTask.isPending}
            className="mt-4 h-11 w-full rounded-xl bg-tg-button text-sm font-medium text-tg-button-text disabled:opacity-60"
          >
            {createTask.isPending ? "Создание..." : "Создать"}
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
