import { motion, type PanInfo } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  getFolderMeta,
  type FolderItem,
  useCreateFolder,
  useDeleteFolder,
  useFolderMetaOptions,
  useFolders,
  useUpdateFolder,
} from "../api/folders";
import { ApiError } from "../api/client";
import { useHaptic } from "../hooks/useHaptic";
import { FolderIcon } from "./FolderIcon";
import { TapMotion } from "./TapMotion";

const SWIPE_BACK_THRESHOLD = 50;
const DEFAULT_ICONS = ["📁", "💼", "🏠", "💡", "📷", "📝", "🎯", "🎓", "💪", "🎨"];
const DEFAULT_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

function getApiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Что-то пошло не так";
  }

  if (typeof error.payload === "object" && error.payload !== null) {
    const payload = error.payload as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  }

  return `Ошибка API (${error.status})`;
}

type FolderManageViewProps = {
  onBack: () => void;
};

export function FolderManageView({ onBack }: FolderManageViewProps) {
  const { data: folders = [] } = useFolders();
  const { data: metaOptions } = useFolderMetaOptions();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const haptic = useHaptic();

  const icons = metaOptions?.icons?.length ? metaOptions.icons : DEFAULT_ICONS;
  const colors = metaOptions?.colors?.length ? metaOptions.colors : DEFAULT_COLORS;

  const [createName, setCreateName] = useState("");
  const [createIcon, setCreateIcon] = useState("📁");
  const [createColor, setCreateColor] = useState("#3B82F6");
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("📁");
  const [editColor, setEditColor] = useState("#3B82F6");
  const [errorText, setErrorText] = useState<string | null>(null);

  const editingFolder = useMemo(
    () => folders.find((folder) => folder.slug === editingSlug) ?? null,
    [editingSlug, folders],
  );

  useEffect(() => {
    if (!icons.includes(createIcon)) {
      setCreateIcon(icons[0] ?? "📁");
    }
  }, [icons, createIcon]);

  useEffect(() => {
    if (!colors.includes(createColor)) {
      setCreateColor(colors[0] ?? "#3B82F6");
    }
  }, [colors, createColor]);

  const startEdit = (folder: FolderItem) => {
    setEditingSlug(folder.slug);
    setEditName(folder.displayName);
    setEditIcon(folder.icon);
    setEditColor(folder.color);
    setErrorText(null);
  };

  const handleCreate = async () => {
    const displayName = createName.trim();
    if (!displayName) {
      setErrorText("Введите название папки");
      return;
    }

    try {
      await createFolder.mutateAsync({
        displayName,
        icon: createIcon,
        color: createColor,
      });
      haptic.notification("success");
      setCreateName("");
      setErrorText(null);
    } catch (error) {
      setErrorText(getApiErrorMessage(error));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingFolder) {
      return;
    }

    const displayName = editName.trim();
    if (!displayName) {
      setErrorText("Название папки не может быть пустым");
      return;
    }

    try {
      await updateFolder.mutateAsync({
        slug: editingFolder.slug,
        payload: editingFolder.isSystem
          ? { displayName }
          : {
              displayName,
              icon: editIcon,
              color: editColor,
            },
      });
      haptic.notification("success");
      setErrorText(null);
      setEditingSlug(null);
    } catch (error) {
      setErrorText(getApiErrorMessage(error));
    }
  };

  const handleDelete = async (slug: string) => {
    if (!window.confirm("Удалить папку? Задачи из нее будут перемещены в Личное.")) {
      return;
    }

    try {
      await deleteFolder.mutateAsync(slug);
      haptic.notification("success");
      if (editingSlug === slug) {
        setEditingSlug(null);
      }
      setErrorText(null);
    } catch (error) {
      setErrorText(getApiErrorMessage(error));
    }
  };

  const handleSwipeBack = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const force = info.offset.x + info.velocity.x * 0.3;
    if (force > SWIPE_BACK_THRESHOLD) {
      onBack();
    }
  };

  return (
    <motion.section
      className="mx-auto w-full max-w-lg px-5 pb-36 pt-6"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.4 }}
      onDragEnd={handleSwipeBack}
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
          <h1 className="text-xl font-bold text-tg-text">Управление папками</h1>
          <p className="text-sm text-tg-hint">{folders.length} папок</p>
        </div>
      </header>

      {errorText && (
        <p className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">{errorText}</p>
      )}

      {/* ── Create new folder ── */}
      <div className="rounded-2xl bg-tg-secondary-bg p-4">
        <p className="text-sm font-semibold text-tg-text">Новая папка</p>
        <input
          type="text"
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          placeholder="Название папки"
          maxLength={50}
          className="mt-3 h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-sm text-tg-text outline-none"
        />

        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-tg-hint">Иконка</p>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {icons.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => setCreateIcon(icon)}
              className={`flex h-10 items-center justify-center rounded-lg text-lg transition-all ${
                createIcon === icon
                  ? "scale-105 bg-tg-button/15 ring-2 ring-tg-button"
                  : "border border-black/10 bg-tg-bg"
              }`}
            >
              <FolderIcon icon={icon} className="text-lg leading-none text-tg-text" />
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-tg-hint">Цвет</p>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setCreateColor(color)}
              className={`flex h-8 items-center justify-center rounded-lg transition-all ${
                createColor === color
                  ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-tg-secondary-bg"
                  : "border border-black/15"
              }`}
              style={{ backgroundColor: color }}
            >
              {createColor === color && (
                <span className="text-sm font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">✓</span>
              )}
            </button>
          ))}
        </div>

        <TapMotion>
          <button
            type="button"
            onClick={handleCreate}
            disabled={createFolder.isPending}
            className="mt-4 h-11 w-full rounded-xl bg-tg-button text-sm font-medium text-tg-button-text disabled:opacity-60"
          >
            {createFolder.isPending ? "Создаю..." : "Создать папку"}
          </button>
        </TapMotion>
      </div>

      {/* ── Folder list ── */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-tg-hint">Список папок</p>
        <div className="space-y-2">
          {folders.map((folder) => {
            const meta = getFolderMeta(folder.slug, folders);

            return (
              <div key={folder.slug} className="rounded-2xl bg-tg-secondary-bg p-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                    style={{ backgroundColor: `${meta.color}22` }}
                  >
                    <FolderIcon icon={meta.icon} className="text-lg leading-none" style={{ color: meta.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-tg-text">{meta.displayName}</p>
                    <p className="truncate text-xs text-tg-hint">{folder.slug}</p>
                  </div>
                  {folder.isSystem && (
                    <span className="rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-tg-hint">
                      System
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <TapMotion>
                    <button
                      type="button"
                      onClick={() => startEdit(folder)}
                      className="h-9 rounded-lg bg-tg-bg px-3 text-xs font-medium text-tg-text"
                    >
                      Изменить
                    </button>
                  </TapMotion>
                  {!folder.isSystem && (
                    <TapMotion>
                      <button
                        type="button"
                        onClick={() => handleDelete(folder.slug)}
                        disabled={deleteFolder.isPending}
                        className="h-9 rounded-lg bg-red-500/15 px-3 text-xs font-medium text-red-600 disabled:opacity-60"
                      >
                        Удалить
                      </button>
                    </TapMotion>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Edit form ── */}
      {editingFolder && (
        <div className="mt-5 rounded-2xl bg-tg-secondary-bg p-4">
          <p className="text-sm font-semibold text-tg-text">Редактирование: {editingFolder.slug}</p>
          <input
            type="text"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            maxLength={50}
            className="mt-3 h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-sm text-tg-text outline-none"
          />

          {!editingFolder.isSystem && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-tg-hint">Иконка</p>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {icons.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setEditIcon(icon)}
                    className={`flex h-10 items-center justify-center rounded-lg text-lg transition-all ${
                      editIcon === icon
                        ? "scale-105 bg-tg-button/15 ring-2 ring-tg-button"
                        : "border border-black/10 bg-tg-bg"
                    }`}
                  >
                    <FolderIcon icon={icon} className="text-lg leading-none text-tg-text" />
                  </button>
                ))}
              </div>

              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-tg-hint">Цвет</p>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    className={`flex h-8 items-center justify-center rounded-lg transition-all ${
                      editColor === color
                        ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-tg-secondary-bg"
                        : "border border-black/15"
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {editColor === color && (
                      <span className="text-sm font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 flex gap-2">
            <TapMotion className="flex-1">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={updateFolder.isPending}
                className="h-11 w-full rounded-xl bg-tg-button text-sm font-medium text-tg-button-text disabled:opacity-60"
              >
                {updateFolder.isPending ? "Сохраняю..." : "Сохранить"}
              </button>
            </TapMotion>
            <TapMotion className="flex-1">
              <button
                type="button"
                onClick={() => setEditingSlug(null)}
                className="h-11 w-full rounded-xl bg-tg-bg text-sm font-medium text-tg-text"
              >
                Отмена
              </button>
            </TapMotion>
          </div>
        </div>
      )}
    </motion.section>
  );
}
