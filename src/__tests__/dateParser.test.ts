import { describe, expect, it } from 'bun:test';
import type { DateParseResult, RecurrenceRule } from '../lib/types';
import { parseDateFromText } from '../lib/dateParser';

// Fixed reference date for reproducibility
const REFERENCE_DATE = new Date('2026-02-10T12:00:00'); // Tuesday, Feb 10, 2026

// Test helper for asserting date results
function expectDate(
  result: DateParseResult,
  expected: {
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    recurrenceRule?: RecurrenceRule | null;
    deadline?: number | null;
    confidence?: 'high' | 'medium' | 'low' | 'none';
    strippedContent?: string;
  }
) {
  if (expected.scheduledDate !== undefined) {
    expect(result.scheduledDate).toBe(expected.scheduledDate);
  }
  if (expected.scheduledTime !== undefined) {
    expect(result.scheduledTime).toBe(expected.scheduledTime);
  }
  if (expected.recurrenceRule !== undefined) {
    expect(result.recurrenceRule).toBe(expected.recurrenceRule);
  }
  if (expected.deadline !== undefined) {
    expect(result.deadline).toBe(expected.deadline);
  }
  if (expected.confidence !== undefined) {
    expect(result.confidence).toBe(expected.confidence);
  }
  if (expected.strippedContent !== undefined) {
    expect(result.strippedContent).toBe(expected.strippedContent);
  }
}

describe('Date Parser: Relative Dates', () => {
  it('parses "сегодня" → 2026-02-10', () => {
    const result = parseDateFromText('Позвонить клиенту сегодня', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-10',
      confidence: 'medium',
    });
  });

  it('parses "завтра" → 2026-02-11', () => {
    const result = parseDateFromText('Встреча завтра', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
      confidence: 'medium',
    });
  });

  it('parses "послезавтра" → 2026-02-12', () => {
    const result = parseDateFromText('Дедлайн послезавтра', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-12',
      confidence: 'medium',
    });
  });

  it('is case insensitive: "ЗАВТРА" → 2026-02-11', () => {
    const result = parseDateFromText('Задача ЗАВТРА', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
    });
  });

  it('strips date phrase from content', () => {
    const result = parseDateFromText('Позвонить клиенту завтра', REFERENCE_DATE);
    expectDate(result, {
      strippedContent: 'Позвонить клиенту',
    });
  });

  it('sets confidence to medium when only date', () => {
    const result = parseDateFromText('сегодня', REFERENCE_DATE);
    expectDate(result, {
      confidence: 'medium',
    });
  });
});

describe('Date Parser: Day Offsets', () => {
  it('parses "через 1 день" → 2026-02-11', () => {
    const result = parseDateFromText('Встреча через 1 день', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
    });
  });

  it('parses "через 3 дня" → 2026-02-13', () => {
    const result = parseDateFromText('Дедлайн через 3 дня', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-13',
    });
  });

  it('parses "через 5 дней" → 2026-02-15', () => {
    const result = parseDateFromText('Отчёт через 5 дней', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-15',
    });
  });

  it('parses "через неделю" → 2026-02-17', () => {
    const result = parseDateFromText('Презентация через неделю', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-17',
    });
  });

  it('handles "через день" (singular) → 2026-02-11', () => {
    const result = parseDateFromText('Позвонить через день', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
    });
  });
});

describe('Date Parser: Weekdays', () => {
  // Reference: Tuesday Feb 10, 2026

  it('parses "в понедельник" → 2026-02-16 (next Monday)', () => {
    const result = parseDateFromText('Встреча в понедельник', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-16',
    });
  });

  it('parses "во вторник" → 2026-02-17 (next Tuesday, not today)', () => {
    const result = parseDateFromText('Звонок во вторник', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-17',
    });
  });

  it('parses "в среду" → 2026-02-11 (tomorrow)', () => {
    const result = parseDateFromText('Обед в среду', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
    });
  });

  it('parses "в четверг" → 2026-02-12', () => {
    const result = parseDateFromText('Презентация в четверг', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-12',
    });
  });

  it('parses "в пятницу" → 2026-02-13', () => {
    const result = parseDateFromText('Отчёт в пятницу', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-13',
    });
  });

  it('parses "в субботу" → 2026-02-14', () => {
    const result = parseDateFromText('Поход в субботу', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-14',
    });
  });

  it('parses "в воскресенье" → 2026-02-15', () => {
    const result = parseDateFromText('Отдых в воскресенье', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-15',
    });
  });
});

describe('Date Parser: Time', () => {
  it('parses "в 10:00" → scheduledTime 10:00', () => {
    const result = parseDateFromText('Встреча в 10:00', REFERENCE_DATE);
    expectDate(result, {
      scheduledTime: '10:00',
    });
  });

  it('parses "в 9:30" → scheduledTime 09:30', () => {
    const result = parseDateFromText('Звонок в 9:30', REFERENCE_DATE);
    expectDate(result, {
      scheduledTime: '09:30',
    });
  });

  it('parses "в 10 часов" → scheduledTime 10:00', () => {
    const result = parseDateFromText('Встреча в 10 часов', REFERENCE_DATE);
    expectDate(result, {
      scheduledTime: '10:00',
    });
  });

  it('parses "утром" → scheduledTime 09:00', () => {
    const result = parseDateFromText('Пробежка утром', REFERENCE_DATE);
    expectDate(result, {
      scheduledTime: '09:00',
    });
  });

  it('parses "днём" → scheduledTime 14:00', () => {
    const result = parseDateFromText('Обед днём', REFERENCE_DATE);
    expectDate(result, {
      scheduledTime: '14:00',
    });
  });

  it('parses "в обед" → scheduledTime 14:00', () => {
    const result = parseDateFromText('Встреча в обед', REFERENCE_DATE);
    expectDate(result, {
      scheduledTime: '14:00',
    });
  });

  it('parses "вечером" → scheduledTime 19:00', () => {
    const result = parseDateFromText('Кино вечером', REFERENCE_DATE);
    expectDate(result, {
      scheduledTime: '19:00',
    });
  });
});

describe('Date Parser: Recurrence', () => {
  it('parses "каждый день" → recurrenceRule daily', () => {
    const result = parseDateFromText('Зарядка каждый день', REFERENCE_DATE);
    expectDate(result, {
      recurrenceRule: 'daily',
    });
  });

  it('parses "по будням" → recurrenceRule weekdays', () => {
    const result = parseDateFromText('Работа по будням', REFERENCE_DATE);
    expectDate(result, {
      recurrenceRule: 'weekdays',
    });
  });

  it('parses "каждый понедельник" → recurrenceRule weekly, scheduledDate next Monday', () => {
    const result = parseDateFromText('Планёрка каждый понедельник', REFERENCE_DATE);
    expectDate(result, {
      recurrenceRule: 'weekly',
      scheduledDate: '2026-02-16', // Next Monday
    });
  });

  it('parses "каждую пятницу" → recurrenceRule weekly, scheduledDate next Friday', () => {
    const result = parseDateFromText('Отчёт каждую пятницу', REFERENCE_DATE);
    expectDate(result, {
      recurrenceRule: 'weekly',
      scheduledDate: '2026-02-13', // Next Friday
    });
  });
});

describe('Date Parser: Combined Patterns', () => {
  it('parses "завтра в 10:00" → date + time + deadline', () => {
    const result = parseDateFromText('Встреча завтра в 10:00', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
      scheduledTime: '10:00',
      confidence: 'high',
    });
    // Deadline should be calculated: 2026-02-11 10:00 in ms
    expect(result.deadline).not.toBeNull();
  });

  it('parses "в пятницу вечером" → date 2026-02-13, time 19:00', () => {
    const result = parseDateFromText('Кино в пятницу вечером', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-13',
      scheduledTime: '19:00',
      confidence: 'high',
    });
  });

  it('parses "каждый понедельник в 9:00" → recurrence + date + time', () => {
    const result = parseDateFromText('Планёрка каждый понедельник в 9:00', REFERENCE_DATE);
    expectDate(result, {
      recurrenceRule: 'weekly',
      scheduledDate: '2026-02-16',
      scheduledTime: '09:00',
    });
  });

  it('parses "через 3 дня утром" → date 2026-02-13, time 09:00', () => {
    const result = parseDateFromText('Звонок через 3 дня утром', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-13',
      scheduledTime: '09:00',
    });
  });

  it('sets confidence to high when date + time', () => {
    const result = parseDateFromText('завтра в 15:00', REFERENCE_DATE);
    expectDate(result, {
      confidence: 'high',
    });
  });
});

describe('Date Parser: Content Stripping', () => {
  it('strips "завтра" from "Позвонить клиенту завтра"', () => {
    const result = parseDateFromText('Позвонить клиенту завтра', REFERENCE_DATE);
    expectDate(result, {
      strippedContent: 'Позвонить клиенту',
    });
  });

  it('strips "завтра в 10:00" from "Встреча завтра в 10:00"', () => {
    const result = parseDateFromText('Встреча завтра в 10:00', REFERENCE_DATE);
    expectDate(result, {
      strippedContent: 'Встреча',
    });
  });

  it('preserves content when no date detected', () => {
    const result = parseDateFromText('Позвонить клиенту', REFERENCE_DATE);
    expectDate(result, {
      strippedContent: 'Позвонить клиенту',
    });
  });
});

describe('Date Parser: No Date Detected', () => {
  it('returns null for plain text "Позвонить клиенту"', () => {
    const result = parseDateFromText('Позвонить клиенту', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: null,
      scheduledTime: null,
      recurrenceRule: null,
      deadline: null,
    });
  });

  it('sets confidence to none when no date/time', () => {
    const result = parseDateFromText('Купить молоко', REFERENCE_DATE);
    expectDate(result, {
      confidence: 'none',
    });
  });

  it('returns original content as strippedContent', () => {
    const result = parseDateFromText('Простая задача', REFERENCE_DATE);
    expectDate(result, {
      strippedContent: 'Простая задача',
    });
  });
});

describe('Date Parser: Deadline Calculation', () => {
  it('calculates deadline when date + time present', () => {
    const result = parseDateFromText('завтра в 10:00', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
      scheduledTime: '10:00',
    });
    const expectedDeadline = new Date('2026-02-11T10:00:00').getTime();
    expect(result.deadline).toBe(expectedDeadline);
  });

  it('returns null deadline when only date (no time)', () => {
    const result = parseDateFromText('завтра', REFERENCE_DATE);
    expectDate(result, {
      scheduledDate: '2026-02-11',
      scheduledTime: null,
      deadline: null,
    });
  });
});
