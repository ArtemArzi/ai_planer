import type { FolderSlug, TaskType, TaskStatus, MediaType, CaptureResult } from './types';
import { parseDateFromText } from './dateParser';

export type FolderPrefixAliases = Record<string, FolderSlug>;

type FolderPrefixSource = {
  slug: string;
  displayName?: string | null;
};

interface MediaContext {
  hasMedia?: boolean;
  mediaType?: MediaType;
  folderAliases?: FolderPrefixAliases;
}

const MULTI_CAPTURE_LIMIT = 10;
const NOTE_LENGTH_THRESHOLD = 500;
const MIN_LIST_ITEMS = 2;
const LIST_SIGNAL_RATIO = 0.8;
const SEMICOLON_ITEM_MAX_LENGTH = 120;

const LIST_PREFIX_PATTERN = /^\s*(?:[-*\u2022]\s+|\d{1,3}[.)]\s+|\[(?: |x|X)\]\s+)/;

const DEFAULT_FOLDER_PREFIX_ALIASES_RAW: Record<string, FolderSlug> = {
  // Work
  work: 'work',
  '\u0440\u0430\u0431\u043e\u0442\u0430': 'work',

  // Personal/Home
  personal: 'personal',
  home: 'personal',
  '\u0434\u043e\u043c': 'personal',
  '\u043b\u0438\u0447\u043d\u043e': 'personal',
  '\u043b\u0438\u0447\u043d\u043e\u0435': 'personal',

  // Ideas / Stories
  ideas: 'ideas',
  idea: 'ideas',
  stories: 'ideas',
  story: 'ideas',
  '\u0438\u0434\u0435\u0438': 'ideas',
  '\u0438\u0434\u0435\u044f': 'ideas',
  '\u0438\u0441\u0442\u043e\u0440\u0438\u0438': 'ideas',
  '\u0438\u0441\u0442\u043e\u0440\u0438\u044f': 'ideas',

  // Media
  media: 'media',
  '\u043c\u0435\u0434\u0438\u0430': 'media',

  // Notes
  notes: 'notes',
  note: 'notes',
  '\u0437\u0430\u043c\u0435\u0442\u043a\u0438': 'notes',
  '\u0437\u0430\u043c\u0435\u0442\u043a\u0430': 'notes',
};

function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function isPrefixBoundary(char: string | undefined): boolean {
  return char === undefined || /\s|:|-/.test(char);
}

function stripPrefixRemainder(value: string): string {
  return value.replace(/^\s*[:\-]?\s*/, '');
}

function normalizeAliasMap(input: Record<string, FolderSlug>): FolderPrefixAliases {
  const output: FolderPrefixAliases = {};

  for (const [alias, slug] of Object.entries(input)) {
    const normalized = normalizeAlias(alias);
    if (normalized) {
      output[normalized] = slug;
    }
  }

  return output;
}

export const DEFAULT_FOLDER_PREFIX_ALIASES: FolderPrefixAliases = normalizeAliasMap(
  DEFAULT_FOLDER_PREFIX_ALIASES_RAW,
);

export function buildFolderPrefixAliases(folders: FolderPrefixSource[] = []): FolderPrefixAliases {
  const aliases: FolderPrefixAliases = { ...DEFAULT_FOLDER_PREFIX_ALIASES };

  for (const folder of folders) {
    const slugAlias = normalizeAlias(folder.slug);
    if (slugAlias) {
      aliases[slugAlias] = folder.slug;
    }

    const displayNameAlias = normalizeAlias(folder.displayName || '');
    if (displayNameAlias) {
      aliases[displayNameAlias] = folder.slug;
    }
  }

  return aliases;
}

type ExplicitFolderMatch = {
  folder: FolderSlug;
  strippedContent: string;
};

function matchExplicitFolderPrefix(text: string, folderAliases: FolderPrefixAliases): ExplicitFolderMatch | null {
  const source = text.trimStart();
  if (!source) {
    return null;
  }

  const aliases = Object.keys(folderAliases)
    .filter((alias) => alias.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const alias of aliases) {
    const head = source.slice(0, alias.length);
    const nextChar = source.slice(alias.length, alias.length + 1) || undefined;
    if (normalizeAlias(head) !== alias || !isPrefixBoundary(nextChar)) {
      continue;
    }

    return {
      folder: folderAliases[alias],
      strippedContent: stripPrefixRemainder(source.slice(alias.length)),
    };
  }

  const tokenMatch = source.match(/^([^\s:\-]+)/u);
  if (!tokenMatch) {
    return null;
  }

  const token = normalizeAlias(tokenMatch[1]);
  if (token.length < 3) {
    return null;
  }

  const slugCandidates = new Set<FolderSlug>();
  for (const alias of aliases) {
    if (alias.startsWith(token)) {
      slugCandidates.add(folderAliases[alias]);
    }
  }

  if (slugCandidates.size !== 1) {
    return null;
  }

  return {
    folder: Array.from(slugCandidates)[0],
    strippedContent: stripPrefixRemainder(source.slice(tokenMatch[1].length)),
  };
}

function stripListPrefix(line: string): string {
  return line.replace(LIST_PREFIX_PATTERN, '').trim();
}

function isExplicitLineList(lines: string[]): boolean {
  if (lines.length < MIN_LIST_ITEMS) {
    return false;
  }

  const markedCount = lines.filter((line) => LIST_PREFIX_PATTERN.test(line)).length;
  return markedCount / lines.length >= LIST_SIGNAL_RATIO;
}

function splitStructuredLineList(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!isExplicitLineList(lines)) {
    return [];
  }

  return lines
    .map((line) => stripListPrefix(line))
    .filter((item) => item.length > 0);
}

function splitSemicolonList(text: string): string[] {
  if (text.includes('\n')) {
    return [];
  }

  if (!text.includes(';')) {
    return [];
  }

  const items = text
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length < MIN_LIST_ITEMS) {
    return [];
  }

  if (items.some((item) => item.length > SEMICOLON_ITEM_MAX_LENGTH)) {
    return [];
  }

  return items;
}

function applyItemLimit(items: string[]): string[] {
  if (items.length <= MULTI_CAPTURE_LIMIT) {
    return items;
  }

  const head = items.slice(0, MULTI_CAPTURE_LIMIT - 1);
  const tail = items.slice(MULTI_CAPTURE_LIMIT - 1).join('\n').trim();

  if (!tail) {
    return head;
  }

  return [...head, tail];
}

export function splitMultiCapture(
  text: string,
  folderAliases: FolderPrefixAliases = DEFAULT_FOLDER_PREFIX_ALIASES,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return [];
  }

  const explicitMatch = matchExplicitFolderPrefix(normalized, folderAliases);
  const listCandidate = explicitMatch ? explicitMatch.strippedContent : normalized;
  const structuredLineItems = splitStructuredLineList(listCandidate);
  if (structuredLineItems.length > 0) {
    return applyItemLimit(structuredLineItems);
  }

  if (normalized.length > NOTE_LENGTH_THRESHOLD) {
    return [normalized];
  }

  const semicolonItems = splitSemicolonList(normalized);
  if (semicolonItems.length > 0) {
    return applyItemLimit(semicolonItems);
  }

  return [normalized];
}

/**
 * Process message text and determine folder, type, status
 *
 * Capture Precedence (highest to lowest):
 * 1. Explicit Folder Prefix -> folder from prefix aliases
 * 2. Content Length (>500 chars) -> type='note', folder='notes' (unless explicit folder)
 * 3. Media Attachment -> folder='media' (unless explicit folder)
 * 4. URL Detection -> folder='media' (unless explicit folder)
 * 5. AI Classification -> fallback
 */
export function processMessage(text: string, context: MediaContext & { timezone?: string } = {}): CaptureResult {
  let content = text;
  let folder: FolderSlug = 'personal';
  let type: TaskType = 'task';
  let status: TaskStatus = 'inbox';
  let mediaType: MediaType | undefined = context.mediaType;
  let needsAiClassification = false;
  let hasExplicitTag = false;

  const folderAliases = context.folderAliases || DEFAULT_FOLDER_PREFIX_ALIASES;
  const timezone = context.timezone || 'UTC';

  const explicitMatch = matchExplicitFolderPrefix(text, folderAliases);
  if (explicitMatch) {
    folder = explicitMatch.folder;
    hasExplicitTag = true;
    content = explicitMatch.strippedContent;
  }

  if (content.length > NOTE_LENGTH_THRESHOLD) {
    type = 'note';
  }

  if (context.hasMedia && context.mediaType) {
    mediaType = context.mediaType;
    if (!hasExplicitTag) {
      folder = 'media';
      needsAiClassification = false;
    }
  }

  const urlMatch = content.match(/https?:\/\/[^\s]+/);
  if (urlMatch && !mediaType) {
    mediaType = 'link';
    if (!hasExplicitTag) {
      folder = 'media';
      needsAiClassification = false;
    }
  }

  if (type === 'note' && !hasExplicitTag) {
    folder = 'notes';
    needsAiClassification = false;
  }

  if (type === 'note' && folder === 'notes') {
    status = 'active';
  } else {
    status = 'inbox';
  }

  if (!hasExplicitTag && !mediaType && type !== 'note') {
    needsAiClassification = true;
  }

  const dateResult = parseDateFromText(content, undefined, timezone);
  const hasDateParsed = dateResult.confidence !== 'none';

  if (hasDateParsed) {
    content = dateResult.strippedContent;
  }

  if (hasDateParsed && dateResult.scheduledDate && type !== 'note') {
    status = 'active';
    needsAiClassification = false;
  }

  return {
    content,
    folder,
    type,
    status,
    mediaType,
    needsAiClassification,
    hasExplicitTag,
    scheduledDate: dateResult.scheduledDate,
    scheduledTime: dateResult.scheduledTime,
    deadline: dateResult.deadline,
    recurrenceRule: dateResult.recurrenceRule,
  };
}
