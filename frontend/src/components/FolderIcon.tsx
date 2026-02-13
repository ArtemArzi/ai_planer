import type { CSSProperties } from "react";

type FolderIconProps = {
  icon: string;
  className?: string;
  style?: CSSProperties;
};

const MATERIAL_ICON_PATTERN = /^[a-z0-9_]+$/i;

const EMOJI_TO_MATERIAL_ICON: Record<string, string> = {
  "📁": "folder",
  "💼": "work",
  "🏠": "person",
  "💡": "lightbulb",
  "📷": "play_circle",
  "📝": "description",
  "🎯": "task_alt",
  "🎓": "school",
  "💪": "fitness_center",
  "🎨": "palette",
  "🏃": "directions_run",
  "🍕": "lunch_dining",
  "✈️": "flight",
  "📚": "menu_book",
  "🎵": "music_note",
  "💰": "payments",
  "🛒": "shopping_cart",
  "⚡": "bolt",
  "🌱": "eco",
  "🔧": "build",
  "❤️": "favorite",
  "🐾": "pets",
  "🎮": "stadia_controller",
  "🧪": "science",
};

export function resolveFolderIconGlyph(icon: string): string {
  const value = icon.trim();
  if (!value) {
    return "folder";
  }

  if (MATERIAL_ICON_PATTERN.test(value)) {
    return value.toLowerCase();
  }

  return EMOJI_TO_MATERIAL_ICON[value] ?? value;
}

export function isMaterialIconGlyph(icon: string): boolean {
  return MATERIAL_ICON_PATTERN.test(icon.trim());
}

export function FolderIcon({ icon, className, style }: FolderIconProps) {
  const glyph = resolveFolderIconGlyph(icon);

  if (isMaterialIconGlyph(glyph)) {
    return <span className={`material-symbols-outlined ${className ?? ""}`} style={style}>{glyph}</span>;
  }

  return <span className={className} style={style}>{glyph}</span>;
}
