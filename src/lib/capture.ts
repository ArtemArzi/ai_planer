import type { Folder, TaskType, TaskStatus, MediaType, CaptureResult } from './types';

interface MediaContext {
  hasMedia?: boolean;
  mediaType?: MediaType;
}

/**
 * Process message text and determine folder, type, status
 * 
 * Capture Precedence (highest to lowest):
 * 1. Explicit Tag (#w, #p, #i) → folder from tag
 * 2. Content Length (>500 chars) → type='note', folder='notes' (unless tagged)
 * 3. Media Attachment → folder='media' (unless tagged)
 * 4. URL Detection → folder='media' (unless tagged)
 * 5. AI Classification → fallback
 */
export function processMessage(text: string, context: MediaContext = {}): CaptureResult {
  let content = text;
  let folder: Folder = 'personal';
  let type: TaskType = 'task';
  let status: TaskStatus = 'inbox';
  let mediaType: MediaType | undefined = context.mediaType;
  let needsAiClassification = false;
  let hasExplicitTag = false;
  
  const tagMatch = text.match(/^#([wpiWPI])\b/);
  
  if (tagMatch) {
    const tagChar = tagMatch[1].toLowerCase();
    const tagMap: Record<string, Folder> = {
      'w': 'work',
      'p': 'personal',
      'i': 'ideas'
    };
    
    if (tagChar in tagMap) {
      folder = tagMap[tagChar];
      hasExplicitTag = true;
      content = text.replace(/^#[wpiWPI]\s*/i, '').trim();
    }
  } else if (text.match(/^#\w+/)) {
    content = text.replace(/^#\w+\s*/, '').trim();
    needsAiClassification = true;
  }
  
  if (content.length > 500) {
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
  
  if (!hasExplicitTag && !mediaType && type !== 'note' && !content.match(/^#\w+/)) {
    needsAiClassification = true;
  }
  
  return {
    content,
    folder,
    type,
    status,
    mediaType,
    needsAiClassification,
    hasExplicitTag
  };
}
