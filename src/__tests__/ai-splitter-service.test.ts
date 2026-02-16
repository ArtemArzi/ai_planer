import { describe, expect, it } from 'bun:test';
import { orchestrateSplit } from '../lib/ai/splitterOrchestrate';
import { buildFolderPrefixAliases, processMessage as captureMessage } from '../lib/capture';

describe('AI Splitter Service', () => {
  it('uses parser in off mode', async () => {
    const result = await orchestrateSplit('task one; task two; task three');
    expect(result.source).toBe('parser');
    expect(result.items.length).toBe(3);
  });

  it('splits semicolon list via parser', async () => {
    const result = await orchestrateSplit('buy milk; call mom; send invoice');
    expect(result.items).toEqual(['buy milk', 'call mom', 'send invoice']);
  });

  it('returns single item for simple text', async () => {
    const result = await orchestrateSplit('simple task');
    expect(result.items.length).toBe(1);
    expect(result.items[0]).toBe('simple task');
  });

  it('preserves single task even with newlines', async () => {
    const result = await orchestrateSplit('first line\nsecond line');
    expect(result.items.length).toBe(1);
  });

  it('handles numbered list via parser', async () => {
    const result = await orchestrateSplit('1. first\n2. second\n3. third');
    expect(result.items.length).toBe(3);
  });

  it('returns empty for whitespace-only input', async () => {
    const result = await orchestrateSplit('   ');
    expect(result.items.length).toBe(0);
  });

  it('uses custom folder aliases in parser fallback', async () => {
    const aliases = buildFolderPrefixAliases([{ slug: 'finance', displayName: 'Финансы' }]);
    const result = await orchestrateSplit('финансы: 1. invoice\n2. taxes', aliases);
    expect(result.items).toEqual(['invoice', 'taxes']);
  });

  it('keeps message-level explicit folder precedence across split items', async () => {
    const aliases = buildFolderPrefixAliases();
    const source = 'work: 1. fix bug\n2. deploy';
    const split = await orchestrateSplit(source, aliases);
    const probe = captureMessage(source, { folderAliases: aliases, timezone: 'UTC' });

    expect(probe.hasExplicitTag).toBe(true);
    expect(probe.folder).toBe('work');

    const folders = split.items.map((item) =>
      captureMessage(`${probe.folder}: ${item}`, { folderAliases: aliases, timezone: 'UTC' }).folder,
    );

    expect(folders).toEqual(['work', 'work']);
  });
});
