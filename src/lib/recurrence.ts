import type { RecurrenceRule } from './types';

export const RECURRENCE_RULES: RecurrenceRule[] = ['daily', 'weekdays', 'weekly'];

export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  return typeof value === 'string' && RECURRENCE_RULES.includes(value as RecurrenceRule);
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateString(): string {
  return toDateString(new Date());
}

function addDays(baseDate: string, days: number): string {
  const [year, month, day] = baseDate.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return toDateString(next);
}

export function nextOccurrence(baseDate: string, recurrenceRule: RecurrenceRule): string {
  if (recurrenceRule === 'daily') {
    return addDays(baseDate, 1);
  }

  if (recurrenceRule === 'weekly') {
    return addDays(baseDate, 7);
  }

  let next = addDays(baseDate, 1);
  while (true) {
    const [year, month, day] = next.split('-').map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday !== 0 && weekday !== 6) {
      return next;
    }
    next = addDays(next, 1);
  }
}

export function buildDeadlineFromSchedule(scheduledDate: string, scheduledTime: string | null, timezone?: string): number | null {
  if (!scheduledTime) {
    return null;
  }

  const tz = timezone || 'UTC';
  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const [year, month, day] = scheduledDate.split('-').map(Number);
  
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date);
  
  const partValues: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      partValues[part.type] = parseInt(part.value, 10);
    }
  }
  
  const shifted = Date.UTC(
    partValues.year,
    partValues.month - 1,
    partValues.day,
    partValues.hour === 24 ? 0 : partValues.hour,
    partValues.minute,
    partValues.second,
  );
  
  const diff = shifted - date.getTime();
  return date.getTime() - diff;
}

export function resolveBaseScheduledDate(task: { scheduledDate: string | null; deadline: number | null }, timezone?: string): string {
  if (task.scheduledDate) {
    return task.scheduledDate;
  }

  if (task.deadline) {
    const tz = timezone || 'UTC';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(task.deadline));

    let year = '';
    let month = '';
    let day = '';

    for (const part of parts) {
      if (part.type === 'year') {
        year = part.value;
      }
      if (part.type === 'month') {
        month = part.value;
      }
      if (part.type === 'day') {
        day = part.value;
      }
    }

    return `${year}-${month}-${day}`;
  }

  return getTodayDateString();
}

export function buildNextRecurringSchedule(task: {
  scheduledDate: string | null;
  scheduledTime: string | null;
  deadline: number | null;
  recurrenceRule: RecurrenceRule;
}, timezone?: string): { scheduledDate: string; deadline: number | null } {
  const baseDate = resolveBaseScheduledDate(task, timezone);
  const scheduledDate = nextOccurrence(baseDate, task.recurrenceRule);
  const deadline = buildDeadlineFromSchedule(scheduledDate, task.scheduledTime, timezone);

  return {
    scheduledDate,
    deadline
  };
}
