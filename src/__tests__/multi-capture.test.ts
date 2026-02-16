import { describe, expect, it } from 'bun:test';
import { buildFolderPrefixAliases, splitMultiCapture } from '../lib/capture';

describe('splitMultiCapture', () => {
  it('returns single item for regular capture text', () => {
    expect(splitMultiCapture('single task')).toEqual(['single task']);
  });

  it('keeps regular multiline prose as single item', () => {
    expect(splitMultiCapture('This is a note line one\nThis is line two')).toEqual([
      'This is a note line one\nThis is line two'
    ]);
  });

  it('splits explicit numbered list', () => {
    expect(splitMultiCapture('1. buy milk\n2. call mom\n3. send invoice')).toEqual([
      'buy milk',
      'call mom',
      'send invoice'
    ]);
  });

  it('splits explicit bullet list', () => {
    expect(splitMultiCapture('- plan sprint\n- sync team\n- ship feature')).toEqual([
      'plan sprint',
      'sync team',
      'ship feature'
    ]);
  });

  it('supports explicit list with leading folder name prefix', () => {
    expect(splitMultiCapture('работа: 1. fix bug\n2. review PR\n3. deploy')).toEqual([
      'fix bug',
      'review PR',
      'deploy'
    ]);
  });

  it('supports explicit list with custom folder display name prefix', () => {
    const aliases = buildFolderPrefixAliases([{ slug: 'finance', displayName: 'Финансы' }]);

    expect(splitMultiCapture('финансы: 1. invoice\n2. taxes', aliases)).toEqual([
      'invoice',
      'taxes',
    ]);
  });

  it('supports explicit list with custom folder partial prefix', () => {
    const aliases = buildFolderPrefixAliases([{ slug: 'finance', displayName: 'Финансы' }]);

    expect(splitMultiCapture('фин: 1. invoice\n2. taxes', aliases)).toEqual([
      'invoice',
      'taxes',
    ]);
  });

  it('service-prefixed list regression: complex service prefixes and bullets', () => {
    const input = 'работа: - task one\n- task two';
    expect(splitMultiCapture(input)).toEqual([
      'task one',
      'task two'
    ]);
  });

  it('service-prefixed list regression: numbered list with space after colon', () => {
    const input = 'personal: 1. item A\n2. item B';
    expect(splitMultiCapture(input)).toEqual([
      'item A',
      'item B'
    ]);
  });

  it('does not treat "работа1" prefix as a valid folder prefix', () => {
    const input = 'работа1. fix bug\n2. review PR';
    expect(splitMultiCapture(input)).toEqual([input]);
  });

  it('does not treat "работаю" as a folder prefix', () => {
    const input = 'работаю 1. fix bug\n2. review PR';
    expect(splitMultiCapture(input)).toEqual([input]);
  });

  it('keeps long multiline text as one note candidate', () => {
    const longText = `${'a'.repeat(260)}\n${'b'.repeat(260)}`;
    expect(splitMultiCapture(longText)).toEqual([longText]);
  });

  it('splits short semicolon-delimited one-line input', () => {
    expect(splitMultiCapture('buy milk; call mom; send invoice')).toEqual([
      'buy milk',
      'call mom',
      'send invoice'
    ]);
  });

  it('does not split semicolon prose when one segment is too long', () => {
    const longSegment = 'x'.repeat(150);
    const input = `quick task; ${longSegment}; another task`;
    expect(splitMultiCapture(input)).toEqual([input]);
  });

  it('does not split semicolons in multiline prose', () => {
    const input = 'First paragraph; still same thought\nSecond paragraph; still same note';
    expect(splitMultiCapture(input)).toEqual([input]);
  });

  it('preserves overflow tail in the last slot', () => {
    const input = [
      '1. 1',
      '2. 2',
      '3. 3',
      '4. 4',
      '5. 5',
      '6. 6',
      '7. 7',
      '8. 8',
      '9. 9',
      '10. 10',
      '11. 11',
      '12. 12'
    ].join('\n');

    expect(splitMultiCapture(input)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10\n11\n12'
    ]);
  });

  it('returns empty list for empty input', () => {
    expect(splitMultiCapture('   ')).toEqual([]);
  });
});
