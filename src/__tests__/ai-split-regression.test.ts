import { describe, expect, it } from 'bun:test';
import { splitMultiCapture } from '../lib/capture';
import { getCasesByKind } from './fixtures/aiSplitCases';

describe('T14: Integration - Multi-split message handling', () => {
  describe('Parser-based split behavior', () => {
    it('splits numbered list into correct number of items', () => {
      const result = splitMultiCapture('1. first\n2. second\n3. third');
      expect(result.length).toBe(3);
      expect(result).toEqual(['first', 'second', 'third']);
    });

    it('splits bullet list into correct number of items', () => {
      const result = splitMultiCapture('- first\n- second\n- third');
      expect(result.length).toBe(3);
    });

    it('splits semicolon list', () => {
      const result = splitMultiCapture('buy milk; call mom; send invoice');
      expect(result.length).toBe(3);
    });

    it('preserves single task with newlines as one item', () => {
      const result = splitMultiCapture('first line\nsecond line');
      expect(result.length).toBe(1);
    });

    it('handles empty input gracefully', () => {
      const result = splitMultiCapture('');
      expect(result.length).toBe(0);
    });
  });

  describe('Idempotency - parser-only path', () => {
    it('same input produces same output', () => {
      const input = '1. task one\n2. task two';
      const first = splitMultiCapture(input);
      const second = splitMultiCapture(input);
      expect(first).toEqual(second);
    });

    it('multiple splits of same content are deterministic', () => {
      const input = 'buy milk; call mom; send invoice';
      for (let i = 0; i < 5; i++) {
        expect(splitMultiCapture(input)).toEqual(['buy milk', 'call mom', 'send invoice']);
      }
    });
  });
});

describe('T15: Contextual blank-line regression tests', () => {
  describe('Blank-line separated short tasks', () => {
    const cases = getCasesByKind('blankline_separate');
    
    cases.forEach((tc, idx) => {
      it(`${tc.description}`, () => {
        const result = splitMultiCapture(tc.input);
        expect(result.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Prose with blank lines stays single', () => {
    const cases = getCasesByKind('prose_blankline_single');
    
    cases.forEach((tc, idx) => {
      it(`${tc.description}`, () => {
        const result = splitMultiCapture(tc.input);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(tc.input);
      });
    });
  });

  describe('Explicit prefix with multiple items', () => {
    const cases = getCasesByKind('explicit_prefix_multi');
    
    cases.forEach((tc, idx) => {
      it(`${tc.description}`, () => {
        const result = splitMultiCapture(tc.input);
        expect(result.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Semicolon list splits correctly', () => {
    const cases = getCasesByKind('semicolon_list');
    
    cases.forEach((tc, idx) => {
      it(`${tc.description}`, () => {
        const result = splitMultiCapture(tc.input);
        expect(result.length).toBe(tc.expectedItems);
      });
    });
  });

  describe('Single task stays single', () => {
    const cases = getCasesByKind('single_task');
    
    cases.forEach((tc, idx) => {
      it(`${tc.description}`, () => {
        const result = splitMultiCapture(tc.input);
        expect(result.length).toBe(1);
      });
    });
  });

  describe('Mixed RU/EN contexts', () => {
    const cases = getCasesByKind('mixed_ru_en');
    
    cases.forEach((tc, idx) => {
      it(`${tc.description}`, () => {
        const result = splitMultiCapture(tc.input);
        expect(result.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
