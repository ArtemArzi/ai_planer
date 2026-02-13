type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

type HighlightPart = {
  text: string;
  highlighted: boolean;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightText(text: string, query: string): HighlightPart[] {
  if (!query.trim()) {
    return [{ text, highlighted: false }];
  }

  const regex = new RegExp(`(${escapeRegExp(query)})`, "ig");
  return text
    .split(regex)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      highlighted: part.toLowerCase() === query.toLowerCase(),
    }));
}

export function SearchBar({ value, onChange, placeholder = "Поиск" }: SearchBarProps) {
  return (
    <label className="flex h-12 w-full items-center gap-3 rounded-2xl bg-tg-secondary-bg px-4 text-tg-hint">
      <span className="material-symbols-outlined text-xl">search</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-tg-text outline-none placeholder:text-tg-hint"
      />
    </label>
  );
}
