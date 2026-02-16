import { describe, it, expect } from 'bun:test';
import { buildFolderPrefixAliases, processMessage } from '../lib/capture';

describe('Capture Precedence: Folder Prefix Detection', () => {
  it('"работа" prefix -> folder=work, even with URL', () => {
    const result = processMessage('работа https://example.com');
    expect(result.folder).toBe('work');
    expect(result.hasExplicitTag).toBe(true);
    expect(result.content).toBe('https://example.com');
  });

  it('"дом" prefix -> folder=personal', () => {
    const result = processMessage('дом buy milk');
    expect(result.folder).toBe('personal');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('"лично" prefix -> folder=personal', () => {
    const result = processMessage('лично call mom');
    expect(result.folder).toBe('personal');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('"идеи" prefix -> folder=ideas', () => {
    const result = processMessage('идеи startup concept');
    expect(result.folder).toBe('ideas');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('"медиа" prefix -> folder=media', () => {
    const result = processMessage('медиа https://example.com');
    expect(result.folder).toBe('media');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('"заметки" prefix -> folder=notes', () => {
    const result = processMessage('заметки quick note');
    expect(result.folder).toBe('notes');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('custom folder display name prefix -> routes to custom slug', () => {
    const folderAliases = buildFolderPrefixAliases([
      { slug: 'finance', displayName: 'Финансы' },
    ]);

    const result = processMessage('финансы оплатить счет', { folderAliases });
    expect(result.folder).toBe('finance');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('unknown prefix -> AI classification needed', () => {
    const result = processMessage('финансы random text');
    expect(result.needsAiClassification).toBe(true);
    expect(result.hasExplicitTag).toBe(false);
  });

  it('prefix is case-insensitive: Работа = работа', () => {
    const result = processMessage('Работа meeting notes');
    expect(result.folder).toBe('work');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('legacy #w is not treated as explicit folder anymore', () => {
    const result = processMessage('#w buy milk');
    expect(result.hasExplicitTag).toBe(false);
    expect(result.needsAiClassification).toBe(true);
    expect(result.content).toBe('#w buy milk');
  });

  it('supports partial prefix when unambiguous: "раб" -> work', () => {
    const result = processMessage('раб сделать отчет');
    expect(result.folder).toBe('work');
    expect(result.hasExplicitTag).toBe(true);
    expect(result.content).toBe('сделать отчет');
  });

  it('supports partial prefix for custom folder when unambiguous', () => {
    const folderAliases = buildFolderPrefixAliases([
      { slug: 'finance', displayName: 'Финансы' },
    ]);

    const result = processMessage('фин оплатить счет', { folderAliases });
    expect(result.folder).toBe('finance');
    expect(result.hasExplicitTag).toBe(true);
    expect(result.content).toBe('оплатить счет');
  });

  it('does not match ambiguous partial prefixes', () => {
    const folderAliases = buildFolderPrefixAliases([
      { slug: 'alpha', displayName: 'Alpha' },
      { slug: 'alpine', displayName: 'Alpine' },
    ]);

    const result = processMessage('alp task', { folderAliases });
    expect(result.hasExplicitTag).toBe(false);
    expect(result.needsAiClassification).toBe(true);
    expect(result.folder).toBe('personal');
  });
});

describe('Capture Precedence: Content Length (Notes)', () => {
  const longText = 'a'.repeat(501);

  it('>500 chars without explicit folder -> folder=notes, type=note', () => {
    const result = processMessage(longText);
    expect(result.folder).toBe('notes');
    expect(result.type).toBe('note');
    expect(result.status).toBe('active');
    expect(result.needsAiClassification).toBe(false);
  });

  it('>500 chars WITH "работа" prefix -> folder=work, type=note', () => {
    const result = processMessage(`работа ${longText}`);
    expect(result.folder).toBe('work');
    expect(result.type).toBe('note');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('exactly 500 chars -> type=task, not note', () => {
    const result = processMessage('a'.repeat(500));
    expect(result.type).toBe('task');
  });
});

describe('Capture Precedence: Media Detection', () => {
  it('media without explicit folder -> folder=media', () => {
    const result = processMessage('', { hasMedia: true, mediaType: 'photo' });
    expect(result.folder).toBe('media');
    expect(result.mediaType).toBe('photo');
  });

  it('media WITH "работа" prefix -> folder=work', () => {
    const result = processMessage('работа cool picture', { hasMedia: true, mediaType: 'photo' });
    expect(result.folder).toBe('work');
    expect(result.mediaType).toBe('photo');
    expect(result.hasExplicitTag).toBe(true);
  });

  it('URL without explicit folder -> folder=media, mediaType=link', () => {
    const result = processMessage('check this out https://example.com');
    expect(result.folder).toBe('media');
    expect(result.mediaType).toBe('link');
  });

  it('URL WITH "работа" prefix -> folder=work', () => {
    const result = processMessage('работа https://work.example.com/doc');
    expect(result.folder).toBe('work');
    expect(result.mediaType).toBe('link');
  });
});

describe('Capture Precedence: AI Classification', () => {
  it('plain text -> needsAiClassification=true', () => {
    const result = processMessage('buy groceries');
    expect(result.needsAiClassification).toBe(true);
    expect(result.folder).toBe('personal');
  });

  it('empty after explicit folder prefix -> empty content', () => {
    const result = processMessage('работа   ');
    expect(result.content.trim()).toBe('');
  });
});

describe('Capture: Cleanup and Ambiguity', () => {
  it('medium cleanup: strips colons and dashes after prefix', () => {
    const cases = [
      'работа: сделать отчет',
      'работа - сделать отчет',
      'работа:- сделать отчет',
    ];

    for (const input of cases) {
      const result = processMessage(input);
      expect(result.folder).toBe('work');
      expect(result.content).toBe('сделать отчет');
    }
  });

  it('mixed-language ambiguity: "work" (EN) and "работа" (RU) both work', () => {
    expect(processMessage('work task').folder).toBe('work');
    expect(processMessage('работа задача').folder).toBe('work');
  });

  it('protected token preservation: does not strip non-prefix words that look similar', () => {
    const result = processMessage('работаю над проектом');
    expect(result.hasExplicitTag).toBe(false);
    expect(result.content).toBe('работаю над проектом');
  });

  it('empty-after-cleanup edge: only prefix and separators', () => {
    const result = processMessage('работа: - ');
    expect(result.folder).toBe('work');
    expect(result.content).toBe('');
  });
});

describe('Capture: Status Assignment', () => {
  const longText = 'a'.repeat(501);

  it('regular task -> status=inbox', () => {
    const result = processMessage('buy milk');
    expect(result.status).toBe('inbox');
  });

  it('note without explicit folder -> status=active', () => {
    const result = processMessage(longText);
    expect(result.status).toBe('active');
    expect(result.folder).toBe('notes');
  });

  it('note WITH explicit folder -> status=inbox', () => {
    const result = processMessage(`работа ${longText}`);
    expect(result.status).toBe('inbox');
  });
});
