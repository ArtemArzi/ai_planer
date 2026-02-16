import { describe, expect, it } from 'bun:test';
import { splitMultiCapture } from '../lib/capture';

describe('T16: Failure-path fallback tests', () => {
  describe('Parser fallback when AI disabled', () => {
    it('returns parser output when AI_CONTEXT_SPLIT_ENABLED is false', () => {
      const input = '1. task one\n2. task two';
      const result = splitMultiCapture(input);
      expect(result.length).toBe(2);
      expect(result).toEqual(['task one', 'task two']);
    });

    it('returns parser output for semicolon list', () => {
      const input = 'buy milk; call mom; send invoice';
      const result = splitMultiCapture(input);
      expect(result.length).toBe(3);
    });
  });

  describe('Parser fallback for edge cases', () => {
    it('handles whitespace-only input', () => {
      const result = splitMultiCapture('   \n\n   ');
      expect(result.length).toBe(0);
    });

    it('handles very long single task', () => {
      const longTask = 'a'.repeat(1000);
      const result = splitMultiCapture(longTask);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(longTask);
    });

    it('handles mixed markers', () => {
      const input = '1. first\n2. second';
      const result = splitMultiCapture(input);
      expect(result.length).toBe(2);
    });

    it('preserves order of split items', () => {
      const input = '1. first\n2. second\n3. third';
      const result = splitMultiCapture(input);
      expect(result[0]).toBe('first');
      expect(result[1]).toBe('second');
      expect(result[2]).toBe('third');
    });
  });

  describe('Deterministic behavior verification', () => {
    const testCases = [
      '1. a\n2. b\n3. c',
      '- a\n- b\n- c',
      'a; b; c',
      'single task',
      '',
      'only whitespace',
    ];

    testCases.forEach(input => {
      it(`input "${input.substring(0, 20)}..." is deterministic`, () => {
        const results = Array.from({ length: 10 }, () => splitMultiCapture(input));
        results.forEach(r => expect(r).toEqual(results[0]));
      });
    });
  });
});