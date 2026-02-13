import { describe, expect, it } from 'bun:test';
import {
  buildDeadlineFromSchedule,
  buildNextRecurringSchedule,
  nextOccurrence,
  resolveBaseScheduledDate,
  toDateString
} from '../lib/recurrence';

describe('recurrence helpers', () => {
  it('daily recurrence adds one day', () => {
    expect(nextOccurrence('2026-02-09', 'daily')).toBe('2026-02-10');
  });

  it('weekly recurrence adds seven days', () => {
    expect(nextOccurrence('2026-02-09', 'weekly')).toBe('2026-02-16');
  });

  it('weekdays recurrence skips weekend', () => {
    expect(nextOccurrence('2026-02-13', 'weekdays')).toBe('2026-02-16');
  });

  it('buildDeadlineFromSchedule maps date + time to timestamp', () => {
    const deadline = buildDeadlineFromSchedule('2026-02-11', '09:30');
    const date = new Date(deadline ?? 0);

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(11);
    expect(date.getHours()).toBe(9);
    expect(date.getMinutes()).toBe(30);
  });

  it('resolveBaseScheduledDate prioritizes scheduledDate over deadline', () => {
    const deadline = new Date(2026, 1, 10, 14, 0, 0, 0).getTime();
    const baseDate = resolveBaseScheduledDate({
      scheduledDate: '2026-02-09',
      deadline
    });

    expect(baseDate).toBe('2026-02-09');
  });

  it('resolveBaseScheduledDate falls back to deadline date', () => {
    const deadline = new Date(2026, 1, 10, 14, 0, 0, 0).getTime();
    const baseDate = resolveBaseScheduledDate({
      scheduledDate: null,
      deadline
    });

    expect(baseDate).toBe('2026-02-10');
  });

  it('buildNextRecurringSchedule produces next date and deadline', () => {
    const result = buildNextRecurringSchedule({
      scheduledDate: '2026-02-12',
      scheduledTime: '19:00',
      deadline: null,
      recurrenceRule: 'daily'
    });

    expect(result.scheduledDate).toBe('2026-02-13');
    expect(toDateString(new Date(result.deadline ?? 0))).toBe('2026-02-13');
  });
});
