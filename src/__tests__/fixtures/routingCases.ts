export interface RoutingCase {
  input: string;
  expectedFolder?: string;
  kind: 'happy' | 'ambiguous' | 'protected';
  description: string;
}

export const ROUTING_CASES: RoutingCase[] = [
  {
    input: 'работа: пофиксить баг',
    expectedFolder: 'work',
    kind: 'happy',
    description: 'Standard Russian work prefix with colon'
  },
  {
    input: 'дом купить молоко',
    expectedFolder: 'personal',
    kind: 'happy',
    description: 'Standard Russian home prefix without colon'
  },
  {
    input: 'ideas: startup plan',
    expectedFolder: 'ideas',
    kind: 'happy',
    description: 'English ideas prefix'
  },
  {
    input: 'работа или дом?',
    expectedFolder: 'work',
    kind: 'ambiguous',
    description: 'Input starting with prefix but not intended as routing'
  },
  {
    input: 'медиа: http://example.com/image.png',
    expectedFolder: 'media',
    kind: 'happy',
    description: 'Media prefix with URL'
  },
  {
    input: 'http://work.com',
    expectedFolder: undefined,
    kind: 'protected',
    description: 'Protected token: prefix string inside a URL'
  },
  {
    input: 'заметки: очень длинный текст...',
    expectedFolder: 'notes',
    kind: 'happy',
    description: 'Notes prefix'
  }
];
