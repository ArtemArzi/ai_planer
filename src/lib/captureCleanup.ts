const SERVICE_TOKENS = [
  'task', 'todo', 'idea', 'note', 'event', 'capture',
  'work', 'работа', 'personal', 'home', 'дом', 'лично', 'личное',
  'ideas', 'stories', 'story', 'идеи', 'идея', 'истории', 'история',
  'media', 'медиа', 'notes', 'заметки', 'заметка',
];

export function cleanCapturedText(text: string): { content: string } {
  if (!text) {
    return { content: '' };
  }

  let content = text.trim();

  for (const token of SERVICE_TOKENS) {
    if (content.toLowerCase().startsWith(token.toLowerCase())) {
      const remainder = content.slice(token.length);
      const nextChar = remainder.charAt(0);

      if (!nextChar || /[\s:\-]/.test(nextChar)) {
        content = remainder.replace(/^[:\-]?\s*/, '');
        break;
      }
    }
  }

  content = content
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { content };
}
