import { describe, expect, it } from 'bun:test';
import { validateSplitJSON, validateSplitObject } from '../lib/ai/splitValidator';
import { normalizeSplitResult } from '../lib/ai/splitterTypes';

describe('AI Splitter Contract', () => {
  describe('normalizeSplitResult', () => {
    it('keeps valid candidates', () => {
      const result = normalizeSplitResult({
        isMulti: true,
        items: [
          { content: 'task 1', confidence: 0.9 },
          { content: 'task 2', confidence: 0.85 },
        ],
      });
      expect(result.isMulti).toBe(true);
      expect(result.items.length).toBe(2);
    });

    it('drops empty items', () => {
      const result = normalizeSplitResult({
        isMulti: true,
        items: [{ content: '' }, { content: 'valid' }],
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].content).toBe('valid');
    });

    it('caps overflow at 10 items', () => {
      const items = Array.from({ length: 15 }, (_, i) => ({ content: `task ${i}` }));
      const result = normalizeSplitResult({ isMulti: true, items });
      expect(result.items.length).toBe(10);
    });

    it('handles invalid raw input', () => {
      const result = normalizeSplitResult('not an object');
      expect(result.source).toBe('parser');
    });
  });

  describe('validateSplitJSON', () => {
    it('accepts valid JSON', () => {
      const result = validateSplitJSON('{"isMulti":true,"items":[{"content":"test"}]}');
      expect(result.valid).toBe(true);
      expect(result.result?.items.length).toBe(1);
    });

    it('rejects invalid JSON', () => {
      const result = validateSplitJSON('not json');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_json');
    });

    it('rejects missing isMulti', () => {
      const result = validateSplitJSON('{"items":[]}');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_isMulti');
    });

    it('rejects empty items', () => {
      const result = validateSplitJSON('{"isMulti":true,"items":[]}');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('empty_items');
    });

    it('rejects too many items', () => {
      const items = Array.from({ length: 15 }, (_, i) => ({ content: `t${i}` }));
      const result = validateSplitJSON(JSON.stringify({ isMulti: true, items }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('too_many_items');
    });
  });

  describe('validateSplitObject', () => {
    it('accepts valid object', () => {
      const result = validateSplitObject({ isMulti: true, items: [{ content: 'test' }] });
      expect(result.valid).toBe(true);
    });

    it('rejects non-object', () => {
      const result = validateSplitObject('string');
      expect(result.valid).toBe(false);
    });
  });
});
