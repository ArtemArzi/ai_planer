import { Drawer } from "vaul";
import { getFolderMeta, toAlphaColor, type FolderItem } from "../../api/folders";
import type { FolderSlug, Task } from "../../api/tasks";
import { SearchBar, highlightText } from "../../components/SearchBar";
import { FolderIcon, isMaterialIconGlyph, resolveFolderIconGlyph } from "../../components/FolderIcon";

const EMOJI_REGEX = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;

type StoryVisual = {
  icon: string;
  gradient: string;
};

const STORY_VISUALS: StoryVisual[] = [
  { icon: "lightbulb", gradient: "linear-gradient(135deg, #60A5FA 0%, #4F46E5 100%)" },
  { icon: "call", gradient: "linear-gradient(135deg, #818CF8 0%, #9333EA 100%)" },
  { icon: "emoji_objects", gradient: "linear-gradient(135deg, #FB923C 0%, #EF4444 100%)" },
  { icon: "architecture", gradient: "linear-gradient(135deg, #38BDF8 0%, #06B6D4 100%)" },
  { icon: "favorite", gradient: "linear-gradient(135deg, #F87171 0%, #DB2777 100%)" },
  { icon: "edit_note", gradient: "linear-gradient(135deg, #FACC15 0%, #F97316 100%)" },
];

function hashStoryId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getStoryVisual(taskId: string): StoryVisual {
  return STORY_VISUALS[hashStoryId(taskId) % STORY_VISUALS.length];
}

function countByFolder(tasks: Task[], folder: FolderSlug): number {
  return tasks.filter((task) => task.folder === folder && task.status !== "deleted").length;
}

function parseIdeaContent(content: string) {
  const trimmed = content.trim();
  const emojiMatch = trimmed.match(EMOJI_REGEX);

  let icon: string | null = null;
  let text = trimmed;

  if (emojiMatch) {
    icon = emojiMatch[0];
    text = trimmed.slice(icon.length).trim();
  }

  const words = text.split(/\s+/).filter(Boolean);
  const shortTitle = words.slice(0, 2).join(" ").slice(0, 16);
  const fullTitle = text.split("\n")[0].slice(0, 40);

  return { icon, text, shortTitle, fullTitle };
}

export type ShelvesStory = {
  task: Task;
  seen: boolean;
};

type ShelvesMainViewProps = {
  tasks: Task[];
  folders: FolderItem[];
  isLoading: boolean;
  searchQuery: string;
  searchResults: Task[];
  storiesEnabled: boolean;
  stories: ShelvesStory[];
  storyPreviewOpen: boolean;
  activeStory: ShelvesStory | null;
  activeStoryIndex: number;
  archivedCount: number;
  onOpenSettings: () => void;
  onSearchChange: (value: string) => void;
  onStoryOpen: (taskId: string) => void;
  onStoryPreviewOpenChange: (open: boolean) => void;
  onStoryStep: (direction: -1 | 1) => void;
  onOpenStoryDetail: () => void;
  onOpenManageView: () => void;
  onOpenFolderView: (folder: FolderSlug) => void;
  onOpenArchiveView: () => void;
};

export function ShelvesMainView({
  tasks,
  folders,
  isLoading,
  searchQuery,
  searchResults,
  storiesEnabled,
  stories,
  storyPreviewOpen,
  activeStory,
  activeStoryIndex,
  archivedCount,
  onOpenSettings,
  onSearchChange,
  onStoryOpen,
  onStoryPreviewOpenChange,
  onStoryStep,
  onOpenStoryDetail,
  onOpenManageView,
  onOpenFolderView,
  onOpenArchiveView,
}: ShelvesMainViewProps) {
  return (
    <section className="mx-auto w-full max-w-lg px-5 pb-36 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-tg-text">Полки</h1>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-tg-secondary-bg text-icon-muted transition-colors hover:bg-black/10"
          aria-label="Настройки"
        >
          <span className="material-symbols-outlined text-xl">settings</span>
        </button>
      </header>

      <div className="mb-5">
        <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Поиск по задачам" />
      </div>

      {storiesEnabled && stories.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-black/5 bg-tg-secondary-bg p-5 shadow-sm dark:border-white/10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-tg-text">Истории идей</h2>
          </div>

          <div className="no-scrollbar -mx-1 flex overflow-x-auto px-1 pb-1 pr-4" style={{ gap: "1.5rem" }}>
            {stories.map(({ task, seen }) => {
              const parsedIdea = parseIdeaContent(task.content);
              const visual = getStoryVisual(task.id);
              const resolvedStoryIcon = parsedIdea.icon ? resolveFolderIconGlyph(parsedIdea.icon) : visual.icon;
              const storyIcon = isMaterialIconGlyph(resolvedStoryIcon) ? resolvedStoryIcon : visual.icon;

              return (
                <button
                  key={`story-${task.id}`}
                  type="button"
                  onClick={() => onStoryOpen(task.id)}
                  className="group relative flex shrink-0 flex-col items-center transition-transform active:scale-95"
                  style={{ width: "88px" }}
                >
                  <div
                    className={`relative flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(45deg,#f09433_0%,#e6683c_25%,#dc2743_50%,#cc2366_75%,#bc1888_100%)] p-[3px] transition-opacity ${seen ? "opacity-55" : "opacity-100"}`}
                  >
                    <div className="h-full w-full overflow-hidden rounded-full bg-white p-[2px] dark:bg-gray-800">
                      <div className="flex h-full w-full items-center justify-center rounded-full" style={{ background: visual.gradient }}>
                        <FolderIcon icon={storyIcon} className="leading-none text-white" style={{ fontSize: "40px" }} />
                      </div>
                    </div>
                  </div>
                  <span
                    className={`mt-2 block w-full truncate px-1 text-center font-medium leading-tight ${seen ? "text-tg-hint" : "text-tg-text"}`}
                    style={{ fontSize: "11px" }}
                  >
                    {parsedIdea.shortTitle || "Идея"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Drawer.Root
        fixed
        repositionInputs={false}
        open={storyPreviewOpen}
        onOpenChange={onStoryPreviewOpenChange}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[32px] bg-tg-secondary-bg p-5 shadow-2xl">
            <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-tg-hint/20" />

            {activeStory ? (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-tg-hint uppercase tracking-wider">
                      Идея {activeStoryIndex + 1} из {stories.length}
                    </span>
                    {!activeStory.seen && (
                      <span className="rounded-full bg-soft-orange/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-soft-orange">
                        Новая
                      </span>
                    )}
                  </div>

                  <h3 className="text-2xl font-bold leading-tight text-tg-text">
                    {parseIdeaContent(activeStory.task.content).fullTitle || "Без названия"}
                  </h3>

                  <div className="mt-3 text-base leading-relaxed text-tg-hint line-clamp-4">
                    {parseIdeaContent(activeStory.task.content).text}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onStoryStep(1)}
                    className="flex h-14 items-center justify-center rounded-2xl bg-tg-bg text-base font-semibold text-tg-text transition-colors active:bg-black/5"
                  >
                    Дальше
                  </button>
                  <button
                    type="button"
                    onClick={onOpenStoryDetail}
                    className="flex h-14 items-center justify-center rounded-2xl bg-tg-button text-base font-semibold text-tg-button-text shadow-sm transition-transform active:scale-[0.98]"
                  >
                    Открыть
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-tg-hint">Идея не найдена</div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {searchQuery.trim() && (
        <div className="mb-5 rounded-2xl bg-tg-secondary-bg p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tg-hint">
            Результаты: {searchResults.length}
          </p>
          {!searchResults.length && <p className="text-sm text-tg-hint">Ничего не найдено</p>}
          {!!searchResults.length && (
            <ul className="space-y-2">
              {searchResults.map((task) => (
                <li key={task.id} className="rounded-xl bg-tg-bg p-3 text-sm text-tg-text line-clamp-3">
                  {highlightText(task.content, searchQuery).map((part, index) => (
                    <span
                      key={`${task.id}-${index}`}
                      className={part.highlighted ? "rounded bg-soft-orange/40 px-0.5" : undefined}
                    >
                      {part.text}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-tg-hint">Папки · {folders.length}</h2>
        <button
          type="button"
          onClick={onOpenManageView}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-tg-secondary-bg px-2.5 text-xs font-medium text-tg-hint"
        >
          <span className="material-symbols-outlined text-sm">edit</span>
          Управлять
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl bg-tg-secondary-bg" />
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          {folders.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {folders.map((folder) => {
                const meta = getFolderMeta(folder.slug, folders);
                const iconBg = toAlphaColor(meta.color, 0.14);
                const taskCount = countByFolder(tasks, folder.slug);

                return (
                  <button
                    key={folder.slug}
                    type="button"
                    onClick={() => onOpenFolderView(folder.slug as FolderSlug)}
                    className="flex aspect-square cursor-pointer flex-col justify-between rounded-2xl bg-tg-secondary-bg p-5 text-left transition-transform active:scale-95"
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: iconBg }}
                      >
                        <FolderIcon icon={meta.icon} className="text-xl leading-none" style={{ color: meta.color }} />
                      </div>
                      <span className="rounded-lg bg-black/5 px-2 py-0.5 text-xs font-semibold text-tg-hint">
                        {taskCount}
                      </span>
                    </div>
                    <div>
                      <p className="truncate font-medium text-tg-text">{meta.displayName}</p>
                      <p className="mt-0.5 truncate text-xs text-tg-hint">{meta.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onOpenArchiveView}
        className="mt-5 flex w-full cursor-pointer items-center justify-between rounded-2xl bg-tg-secondary-bg p-4 text-left transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/5">
            <span className="material-symbols-outlined text-xl text-icon-muted">archive</span>
          </div>
          <div>
            <p className="text-sm font-medium text-tg-text">Архив</p>
            <p className="text-xs text-tg-hint">Завершённые задачи</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-tg-hint">{archivedCount}</span>
          <span className="material-symbols-outlined text-lg text-icon-muted">chevron_right</span>
        </div>
      </button>
    </section>
  );
}
