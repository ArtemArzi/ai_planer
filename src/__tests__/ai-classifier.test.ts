import { describe, expect, it } from 'bun:test';
import { buildSystemPrompt, normalizeClassificationResult } from '../lib/ai/classifier';
import type { FolderContext } from '../lib/ai/folderContext';

describe('AI classifier prompt', () => {
  it('builds fallback prompt with default folders', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('work');
    expect(prompt).toContain('personal');
    expect(prompt).toContain('ideas');
    expect(prompt).toContain('Return ONLY JSON');
  });

  it('builds context prompt with allowed slugs list', () => {
    const context: FolderContext = {
      folders: [
        { slug: 'work', displayName: 'Работа', isSystem: true, samples: ['созвон с командой'] },
        { slug: 'finance', displayName: 'Финансы', isSystem: false, samples: ['оплатить счет'] },
      ],
    };

    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('Allowed folder slugs: work, finance');
    expect(prompt).toContain('Работа');
    expect(prompt).toContain('Финансы');
  });
});

describe('AI classifier normalization', () => {
  it('normalizes folder casing and trims confidence', () => {
    const result = normalizeClassificationResult(
      { folder: ' WORK ', confidence: '0.85' },
      ['work', 'personal', 'ideas'],
    );

    expect(result.folder).toBe('work');
    expect(result.confidence).toBe(0.85);
  });

  it('clamps confidence to [0, 1]', () => {
    const high = normalizeClassificationResult({ folder: 'work', confidence: 7 }, ['work']);
    const low = normalizeClassificationResult({ folder: 'work', confidence: -10 }, ['work']);

    expect(high.confidence).toBe(1);
    expect(low.confidence).toBe(0);
  });

  it('throws for folder outside allowlist', () => {
    expect(() => normalizeClassificationResult({ folder: 'random', confidence: 0.8 }, ['work', 'personal'])).toThrow(
      'outside allowlist',
    );
  });
});
