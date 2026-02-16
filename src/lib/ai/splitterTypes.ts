import type { FolderSlug } from '../types';

export const MAX_SPLIT_ITEMS = 10;
export const MAX_ITEM_LENGTH = 500;

export interface SplitCandidate {
  content: string;
  folder?: FolderSlug;
  confidence: number;
  reason?: string;
}

export interface SplitResult {
  isMulti: boolean;
  items: SplitCandidate[];
  source: 'ai' | 'parser';
  reason?: string;
}

export function normalizeSplitResult(raw: unknown, maxItems = MAX_SPLIT_ITEMS): SplitResult {
  if (!raw || typeof raw !== 'object') {
    return { isMulti: false, items: [], source: 'parser', reason: 'invalid_raw' };
  }

  const obj = raw as Record<string, unknown>;

  if (obj.isMulti !== true) {
    return { isMulti: false, items: [], source: 'ai', reason: 'not_multi' };
  }

  const rawItems = obj.items;
  if (!Array.isArray(rawItems)) {
    return { isMulti: false, items: [], source: 'ai', reason: 'items_not_array' };
  }

  const candidates: SplitCandidate[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const content = typeof record.content === 'string' ? record.content.trim() : '';

    if (!content) continue;
    if (content.length > MAX_ITEM_LENGTH) continue;

    const folder = typeof record.folder === 'string' ? record.folder as FolderSlug : undefined;
    const confidence = typeof record.confidence === 'number' 
      ? Math.max(0, Math.min(1, record.confidence))
      : 0.5;
    const reason = typeof record.reason === 'string' ? record.reason : undefined;

    candidates.push({ content, folder, confidence, reason });

    if (candidates.length >= maxItems) break;
  }

  if (candidates.length === 0) {
    return { isMulti: false, items: [], source: 'ai', reason: 'no_valid_items' };
  }

  return {
    isMulti: candidates.length > 1,
    items: candidates,
    source: 'ai',
  };
}

export function createSingleItemResult(content: string): SplitResult {
  return {
    isMulti: false,
    items: [{ content, confidence: 1.0 }],
    source: 'parser',
  };
}
