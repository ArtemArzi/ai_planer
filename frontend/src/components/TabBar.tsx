import { useUIStore } from "../stores/uiStore";

export function TabBar() {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-tg-secondary-bg/95 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur-md">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab("focus", "tab-bar")}
          className={`flex h-12 items-center justify-center gap-2.5 rounded-2xl text-sm font-semibold transition-all ${
            activeTab === "focus"
              ? "bg-tg-button text-tg-button-text shadow-sm"
              : "text-icon-muted hover:bg-black/5"
          }`}
        >
          <span className={`material-symbols-outlined text-xl ${activeTab === "focus" ? "filled" : ""}`}>
            target
          </span>
          Фокус
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("shelves", "tab-bar")}
          className={`flex h-12 items-center justify-center gap-2.5 rounded-2xl text-sm font-semibold transition-all ${
            activeTab === "shelves"
              ? "bg-tg-button text-tg-button-text shadow-sm"
              : "text-icon-muted hover:bg-black/5"
          }`}
        >
          <span className={`material-symbols-outlined text-xl ${activeTab === "shelves" ? "filled" : ""}`}>
            grid_view
          </span>
          Полки
        </button>
      </div>
    </nav>
  );
}
