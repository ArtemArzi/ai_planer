import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import { openLink } from "@telegram-apps/sdk-react";
import { getFolderMeta, useFolders } from "../../api/folders";
import type { Task, RecurrenceRule } from "../../api/tasks";
import { useTaskGoogleCalendarAction, useUpdateTask } from "../../api/tasks";
import { useMe } from "../../api/users";
import { fetchGoogleConnectUrl } from "../../api/google";
import { FolderIcon } from "../FolderIcon";
import { useHaptic } from "../../hooks/useHaptic";

type TaskDetailSheetProps = {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
};

const TYPE_ICONS: Record<string, string> = {
  task: "task_alt",
  note: "description",
};

const TYPE_LABELS: Record<string, string> = {
  task: "Задача",
  note: "Заметка",
};

function formatScheduledDate(task: Task): string {
  if (!task.scheduledDate) return "";
  const date = new Date(task.scheduledDate + "T00:00:00");
  const label = date
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    .replace(/\s*г\.?$/, "");
  if (task.scheduledTime) {
    return `${label}, ${task.scheduledTime.slice(0, 5)}`;
  }
  return label;
}

const RECURRENCE_OPTIONS: { value: RecurrenceRule | null; label: string }[] = [
  { value: null, label: "Нет" },
  { value: "daily", label: "Каждый день" },
  { value: "weekdays", label: "Будни" },
  { value: "weekly", label: "Каждую неделю" },
];

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  onComplete,
  onDelete,
}: TaskDetailSheetProps) {
  const { data: me } = useMe();
  const { data: folders = [] } = useFolders();
  const folderMeta = task ? getFolderMeta(task.folder, folders) : null;
  const updateTask = useUpdateTask();
  const taskGoogleCalendarAction = useTaskGoogleCalendarAction();
  const haptic = useHaptic();
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState("");
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [openSection, setOpenSection] = useState<"folder" | "date" | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceRule | null>(null);

  // Reset local state when drawer closes
  useEffect(() => {
    if (!open) {
      setIsEditingDesc(false);
      setDescDraft("");
      setIsEditingContent(false);
      setContentDraft("");
      setOpenSection(null);
    }
  }, [open]);

  // Reset local state when task changes
  useEffect(() => {
    setIsEditingDesc(false);
    setDescDraft("");
    setIsEditingContent(false);
    setContentDraft("");
    setOpenSection(null);
  }, [task?.id]);

  const placeCaretAtEnd = (element: HTMLTextAreaElement | null) => {
    if (!element) {
      return;
    }
    const end = element.value.length;
    element.focus();
    element.setSelectionRange(end, end);
  };

  useEffect(() => {
    if (!isEditingContent) {
      return;
    }
    const frameId = requestAnimationFrame(() => {
      placeCaretAtEnd(contentTextareaRef.current);
    });
    return () => cancelAnimationFrame(frameId);
  }, [isEditingContent]);

  useEffect(() => {
    if (!isEditingDesc) {
      return;
    }
    const frameId = requestAnimationFrame(() => {
      placeCaretAtEnd(descTextareaRef.current);
    });
    return () => cancelAnimationFrame(frameId);
  }, [isEditingDesc]);

  const toggleSection = (section: "folder" | "date") => {
    haptic.selection();
    setOpenSection((prev) => {
      if (prev === section) return null;
      if (section === "date" && task) {
        setDateDraft(task.scheduledDate ?? "");
        setTimeDraft(task.scheduledTime ?? "");
        setRecurrenceDraft(task.recurrenceRule ?? null);
      }
      return section;
    });
  };

  const openGoogleConnectFlow = async () => {
    const googleAuthUrl = await fetchGoogleConnectUrl();

    if (openLink.isAvailable()) {
      openLink(googleAuthUrl, { tryInstantView: false });
      return;
    }

    window.open(googleAuthUrl, "_blank");
  };

  const handleConnectGoogleClick = async () => {
    try {
      await openGoogleConnectFlow();
    } catch (error) {
      console.error("Failed to open Google connect flow", error);
      haptic.notification("error");
    }
  };

  const saveDateDraft = async (alsoAddToGoogle: boolean) => {
    if (!task) return;

    const date = dateDraft || null;
    const time = timeDraft || null;
    const updates: Record<string, unknown> = {
      scheduledDate: date,
      scheduledTime: time,
      recurrenceRule: recurrenceDraft,
    };
    if (date && time) {
      const [hours, minutes] = time.split(":").map(Number);
      const deadlineDate = new Date(date + "T00:00:00");
      deadlineDate.setHours(hours, minutes, 0, 0);
      updates.deadline = deadlineDate.getTime();
    } else {
      updates.deadline = null;
    }
    if (date) {
      updates.status = "active";
    }

    try {
      const updatedTask = await updateTask.mutateAsync({ id: task.id, updates });

      if (alsoAddToGoogle) {
        if (!me?.hasGoogleCalendar) {
          haptic.selection();
          await openGoogleConnectFlow();
        } else if (!updatedTask.deadline) {
          haptic.notification("error");
          return;
        } else {
          await taskGoogleCalendarAction.mutateAsync({
            id: updatedTask.id,
            action: "add",
          });
        }
      }

      haptic.notification("success");
      setOpenSection(null);
    } catch (error) {
      console.error("Failed to save date draft", error);
      haptic.notification("error");
    }
  };

  const clearDateDraft = async () => {
    if (!task) return;

    try {
      await updateTask.mutateAsync({
        id: task.id,
        updates: {
          scheduledDate: null,
          scheduledTime: null,
          deadline: null,
          recurrenceRule: null,
        },
      });

      if (task.googleEventId && me?.hasGoogleCalendar) {
        await taskGoogleCalendarAction.mutateAsync({
          id: task.id,
          action: "remove",
        });
      }

      haptic.notification("success");
      setOpenSection(null);
    } catch (error) {
      console.error("Failed to clear date draft", error);
      haptic.notification("error");
    }
  };

  const isTask = task ? task.type === "task" && !task.isIdea : false;
  const isNote = task ? task.type === "note" && !task.isIdea : false;
  const isIdea = task?.isIdea ?? false;
  const showDateChip = isTask;
  const isDateActionPending = updateTask.isPending || taskGoogleCalendarAction.isPending;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} fixed repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-3xl bg-tg-secondary-bg"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mb-4 mt-5 h-1.5 w-10 flex-shrink-0 rounded-full bg-tg-hint/40" />

          <div className="flex-1 overflow-y-auto px-5 pb-5">
            {!task && (
              <div className="py-10 text-center">
                <p className="text-sm text-tg-hint">Задача не выбрана</p>
              </div>
            )}

            {task && (
              <>
                <div className="flex items-center justify-between">
                  <Drawer.Title className="text-lg font-bold text-tg-text">Детали задачи</Drawer.Title>
                </div>

                {isEditingContent ? (
                  <div className="mt-4">
                    <textarea
                      ref={contentTextareaRef}
                      value={contentDraft}
                      onChange={(e) => setContentDraft(e.target.value)}
                      placeholder="Текст задачи..."
                      className="min-h-[100px] w-full resize-none rounded-xl border border-black/10 bg-tg-secondary-bg p-3 text-base text-tg-text outline-none focus:border-tg-button"
                      autoFocus
                      data-vaul-no-drag
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = contentDraft.trim();
                          if (trimmed && trimmed !== task.content) {
                            updateTask.mutate({
                              id: task.id,
                              updates: { content: trimmed },
                            });
                            haptic.notification("success");
                          }
                          setIsEditingContent(false);
                        }}
                        className="flex-1 rounded-xl bg-tg-button py-2 text-sm font-medium text-tg-button-text"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingContent(false)}
                        className="rounded-xl bg-tg-bg px-4 py-2 text-sm text-tg-hint"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-tg-text cursor-pointer active:opacity-70 transition-opacity"
                    onClick={() => {
                      setContentDraft(task.content);
                      setIsEditingContent(true);
                      haptic.selection();
                    }}
                  >
                    {task.content}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => toggleSection("folder")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-transform active:scale-95 ${
                      openSection === "folder"
                        ? "bg-tg-button/15 text-tg-button"
                        : "bg-tg-bg text-tg-hint"
                    }`}
                  >
                    <FolderIcon icon={folderMeta?.icon ?? "folder"} className="text-base leading-none" />
                    {folderMeta?.displayName ?? task.folder}
                    <span className="material-symbols-outlined text-sm">expand_more</span>
                  </button>

                  {isIdea ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-tg-bg px-3 py-1.5 text-tg-hint">
                      <span className="material-symbols-outlined text-base">lightbulb</span>
                      Идея
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        haptic.selection();
                        const newType = task.type === "task" ? "note" : "task";
                        const updates: Partial<Pick<Task, "type" | "folder" | "scheduledDate" | "scheduledTime" | "deadline" | "recurrenceRule">> = { type: newType };
                        if (newType === "note") {
                          updates.folder = "notes";
                          updates.scheduledDate = null;
                          updates.scheduledTime = null;
                          updates.deadline = null;
                          updates.recurrenceRule = null;
                        } else if (task.folder === "notes") {
                          updates.folder = "work";
                        }
                        updateTask.mutate({ id: task.id, updates });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-tg-bg px-3 py-1.5 text-tg-hint transition-transform active:scale-95"
                    >
                      <span className="material-symbols-outlined text-base">
                        {TYPE_ICONS[task.type] ?? "task_alt"}
                      </span>
                      {TYPE_LABELS[task.type] ?? task.type}
                      <span className="material-symbols-outlined text-sm">swap_horiz</span>
                    </button>
                  )}

                  {showDateChip && (
                    <button
                      type="button"
                      onClick={() => toggleSection("date")}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-transform active:scale-95 ${
                        openSection === "date"
                          ? "bg-tg-button/15 text-tg-button"
                          : "bg-tg-bg text-tg-hint"
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">event</span>
                      {task.scheduledDate ? (
                        <>
                          {formatScheduledDate(task)}
                          <span className="material-symbols-outlined text-sm">expand_more</span>
                        </>
                      ) : (
                        "+ Дата"
                      )}
                    </button>
                  )}
                </div>

                {openSection === "folder" && (
                  <div className="mt-3 rounded-2xl bg-tg-bg p-3">
                    <div className="grid gap-0.5">
                      {folders.map((folder) => {
                        const meta = getFolderMeta(folder.slug, folders);
                        const isSelected = folder.slug === task.folder;
                        return (
                          <button
                            key={folder.slug}
                            type="button"
                            onClick={() => {
                              const updates: Record<string, unknown> = { folder: folder.slug };
                              if (folder.slug === "notes") {
                                updates.type = "note";
                                updates.isIdea = false;
                                updates.scheduledDate = null;
                                updates.scheduledTime = null;
                                updates.deadline = null;
                                updates.recurrenceRule = null;
                              } else if (folder.slug === "ideas") {
                                updates.isIdea = true;
                                updates.type = "task";
                                updates.scheduledDate = null;
                                updates.scheduledTime = null;
                                updates.deadline = null;
                                updates.recurrenceRule = null;
                              } else {
                                updates.type = "task";
                                updates.isIdea = false;
                              }
                              updateTask.mutate({ id: task.id, updates });
                              haptic.notification("success");
                              setOpenSection(null);
                            }}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-transform active:scale-[0.98] ${
                              isSelected ? "bg-tg-button/10 font-medium text-tg-button" : "text-tg-text"
                            }`}
                          >
                            <FolderIcon icon={meta.icon} className="text-lg" />
                            <span>{meta.displayName}</span>
                            {isSelected && (
                              <span className="material-symbols-outlined ml-auto text-base text-tg-button">check</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {openSection === "date" && (
                  <div className="mt-3 overflow-hidden rounded-2xl bg-tg-bg p-4">
                    <p className="text-xs font-medium text-tg-hint">Дата</p>
                    <input
                      type="date"
                      data-vaul-no-drag
                      value={dateDraft}
                      onChange={(e) => setDateDraft(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-tg-secondary-bg px-3 text-sm text-tg-text outline-none"
                    />

                    <p className="mt-3 text-xs font-medium text-tg-hint">Время</p>
                    <input
                      type="time"
                      data-vaul-no-drag
                      value={timeDraft}
                      onChange={(e) => setTimeDraft(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-tg-secondary-bg px-3 text-sm text-tg-text outline-none"
                    />

                    <p className="mt-4 text-xs font-medium text-tg-hint">Повтор</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {RECURRENCE_OPTIONS.map((opt) => {
                        const active = recurrenceDraft === opt.value;
                        return (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => {
                              setRecurrenceDraft(opt.value);
                              haptic.selection();
                            }}
                            className={`h-9 rounded-xl text-xs transition-transform active:scale-95 ${
                              active ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary-bg text-tg-text"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void saveDateDraft(false)}
                        disabled={!dateDraft || isDateActionPending}
                        className="rounded-xl bg-tg-button py-2.5 text-sm font-medium text-tg-button-text disabled:opacity-40"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveDateDraft(true)}
                        disabled={!dateDraft || !timeDraft || isDateActionPending}
                        className="rounded-xl bg-blue-500/20 py-2.5 text-sm font-medium text-blue-700 disabled:opacity-40"
                      >
                        Сохранить + Google
                      </button>
                    </div>

                    {dateDraft && !timeDraft && (
                      <p className="mt-2 text-xs text-tg-hint">Для добавления в Google Calendar укажите время</p>
                    )}

                    {!me?.hasGoogleCalendar && (
                      <div className="mt-3 rounded-xl bg-blue-500/10 p-3">
                        <p className="text-xs text-tg-hint">Google Calendar не подключен. Подключите и добавляйте встречи в один тап.</p>
                        <button
                          type="button"
                          onClick={() => void handleConnectGoogleClick()}
                          className="mt-2 h-9 w-full rounded-lg bg-blue-500/20 text-xs font-medium text-blue-700"
                        >
                          Подключить Google Calendar
                        </button>
                      </div>
                    )}

                    {task.googleEventId && (
                      <div className="mt-3 rounded-xl bg-green-500/10 p-3">
                        <p className="text-xs font-medium text-green-700">Событие уже добавлено в Google Calendar</p>
                        <button
                          type="button"
                          onClick={() =>
                            void taskGoogleCalendarAction.mutateAsync({
                              id: task.id,
                              action: "remove",
                            })
                          }
                          disabled={isDateActionPending}
                          className="mt-2 h-9 w-full rounded-lg bg-red-500/15 text-xs font-medium text-red-600 disabled:opacity-40"
                        >
                          Убрать из Google Calendar
                        </button>
                      </div>
                    )}

                    {(task.scheduledDate || task.deadline || task.recurrenceRule) && (
                      <button
                        type="button"
                        onClick={() => void clearDateDraft()}
                        disabled={isDateActionPending}
                        className="mt-3 w-full rounded-xl bg-tg-secondary-bg px-4 py-2.5 text-sm text-red-500 disabled:opacity-40"
                      >
                        Сбросить дату и время
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-5 rounded-2xl bg-tg-bg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-tg-text">Описание</p>
                  </div>

                  {isEditingDesc ? (
                    <div className="mt-2">
                      <textarea
                        ref={descTextareaRef}
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        placeholder="Добавьте описание..."
                        className="h-24 w-full resize-none rounded-xl border border-black/10 bg-tg-secondary-bg p-3 text-sm text-tg-text outline-none focus:border-tg-button"
                        autoFocus
                        data-vaul-no-drag
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = descDraft.trim();
                            updateTask.mutate({
                              id: task.id,
                              updates: { description: trimmed || null },
                            });
                            haptic.notification("success");
                            setIsEditingDesc(false);
                          }}
                          className="flex-1 rounded-xl bg-tg-button py-2 text-sm font-medium text-tg-button-text"
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingDesc(false)}
                          className="rounded-xl bg-tg-bg px-4 py-2 text-sm text-tg-hint"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer active:opacity-70 transition-opacity"
                      onClick={() => {
                        setDescDraft(task.description ?? "");
                        setIsEditingDesc(true);
                        haptic.selection();
                      }}
                    >
                      {task.description ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-tg-hint">
                          {task.description}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm italic text-tg-hint/60">Нажмите, чтобы добавить описание...</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6 grid gap-3">
                  {isTask && onComplete && (
                    <button
                      type="button"
                      onClick={() => onComplete(task.id)}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-green-500 text-sm font-semibold text-white"
                    >
                      <span className="material-symbols-outlined text-xl">check</span>
                      Выполнено
                    </button>
                  )}

                  {isNote && (
                    <button
                      type="button"
                      onClick={() => {
                        updateTask.mutate({ id: task.id, updates: { status: "archived" } });
                        haptic.notification("success");
                        onOpenChange(false);
                      }}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-tg-bg text-sm font-semibold text-tg-text"
                    >
                      <span className="material-symbols-outlined text-xl">archive</span>
                      Архивировать
                    </button>
                  )}

                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(task.id)}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-semibold text-white"
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                      Удалить
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
