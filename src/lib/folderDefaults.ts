import type { SystemFolderSlug } from './types';
import { SYSTEM_FOLDER_SLUGS } from './types';

export const MAX_CUSTOM_FOLDERS = 15;

export const FOLDER_ICONS = [
  '📁', '💼', '🏠', '💡', '📷', '📝',
  '🎯', '🎓', '💪', '🎨', '🏃', '🍕',
  '✈️', '📚', '🎵', '💰', '🛒', '⚡',
  '🌱', '🔧', '❤️', '🐾', '🎮', '🧪',
] as const;

export const FOLDER_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#14B8A6', '#6366F1', '#84CC16', '#A855F7',
] as const;

export type FolderIcon = typeof FOLDER_ICONS[number];
export type FolderColor = typeof FOLDER_COLORS[number];

export interface SystemFolderDefaults {
  slug: SystemFolderSlug;
  displayName: string;
  icon: string;
  color: string;
  position: number;
}

export const SYSTEM_FOLDER_DEFAULTS: Record<SystemFolderSlug, SystemFolderDefaults> = {
  work: { slug: 'work', displayName: 'Работа', icon: '💼', color: '#3B82F6', position: 0 },
  personal: { slug: 'personal', displayName: 'Личное', icon: '🏠', color: '#10B981', position: 1 },
  ideas: { slug: 'ideas', displayName: 'Идеи', icon: '💡', color: '#F59E0B', position: 2 },
  media: { slug: 'media', displayName: 'Медиа', icon: '📷', color: '#8B5CF6', position: 3 },
  notes: { slug: 'notes', displayName: 'Заметки', icon: '📝', color: '#EC4899', position: 4 },
};

export const RESERVED_SLUGS = new Set<string>([
  ...SYSTEM_FOLDER_SLUGS,
  'inbox',
  'all',
  'archive',
  'trash',
  'today',
  'upcoming',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function isValidIcon(icon: string): boolean {
  return (FOLDER_ICONS as readonly string[]).includes(icon);
}

export function isValidColor(color: string): boolean {
  return (FOLDER_COLORS as readonly string[]).includes(color);
}

export function isSystemSlug(slug: string): slug is SystemFolderSlug {
  return (SYSTEM_FOLDER_SLUGS as readonly string[]).includes(slug);
}
