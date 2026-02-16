import type { SplitResult } from './splitterTypes';
import { normalizeSplitResult, MAX_SPLIT_ITEMS } from './splitterTypes';

export interface ValidationResult {
  valid: boolean;
  result?: SplitResult;
  error?: string;
}

const EXPECTED_SCHEMA = {
  isMulti: 'boolean',
  items: 'array',
};

function validateType(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    default:
      return false;
  }
}

function validateItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  if (typeof record.content !== 'string') return false;
  if (record.content.trim().length === 0) return false;
  if (record.confidence !== undefined && typeof record.confidence !== 'number') return false;
  if (record.folder !== undefined && typeof record.folder !== 'string') return false;
  return true;
}

export function validateSplitJSON(jsonString: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: 'invalid_json' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'not_object' };
  }

  const record = parsed as Record<string, unknown>;

  if (!validateType(record.isMulti, 'boolean')) {
    return { valid: false, error: 'missing_isMulti' };
  }

  if (!validateType(record.items, 'array')) {
    return { valid: false, error: 'missing_items' };
  }

  const items = record.items as unknown[];
  if (items.length === 0) {
    return { valid: false, error: 'empty_items' };
  }

  if (items.length > MAX_SPLIT_ITEMS) {
    return { valid: false, error: 'too_many_items' };
  }

  const validItems = items.filter(validateItem);
  if (validItems.length === 0) {
    return { valid: false, error: 'no_valid_items' };
  }

  const normalized = normalizeSplitResult({ isMulti: record.isMulti, items: validItems });
  
  return { valid: true, result: normalized };
}

export function validateSplitObject(obj: unknown): ValidationResult {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: 'not_object' };
  }

  const normalized = normalizeSplitResult(obj);
  
  if (normalized.items.length === 0) {
    return { valid: false, error: 'no_valid_items' };
  }

  return { valid: true, result: normalized };
}
