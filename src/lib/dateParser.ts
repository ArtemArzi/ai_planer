// LAZY FLOW - Russian Date Parser Module
// Regex-based date parsing for Russian language
// ALL timestamps are in MILLISECONDS (JavaScript Date.now() format)

import type { DateParseResult, RecurrenceRule } from './types';

// ===== HELPER FUNCTIONS =====

/**
 * Formats a Date object as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats hours and minutes as HH:mm
 */
function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Gets the next occurrence of a specific weekday
 * @param dayOfWeek 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 * @param referenceDate The reference date to calculate from
 * @returns Date object for the next occurrence of that weekday
 * 
 * IMPORTANT: If today is the target day, returns NEXT week (today + 7)
 */
function getNextWeekday(dayOfWeek: number, referenceDate: Date): Date {
  const result = new Date(referenceDate);
  result.setHours(0, 0, 0, 0);
  
  const currentDay = result.getDay();
  let daysToAdd = dayOfWeek - currentDay;
  
  // If today is the target day OR target is in the past, go to next week
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }
  
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

function calculateDeadline(scheduledDate: string, scheduledTime: string, timezone: string): number {
  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const [year, month, day] = scheduledDate.split('-').map(Number);
  
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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

// ===== MAIN PARSER FUNCTION =====

/**
 * Parses Russian date/time expressions from text
 * @param text User input text
 * @param referenceDate Optional reference date (defaults to now)
 * @param timezone User's timezone for accurate deadline calculation
 * @returns DateParseResult with parsed date/time and stripped content
 */
export function parseDateFromText(text: string, referenceDate?: Date, timezone?: string): DateParseResult {
  const tz = timezone || 'UTC';
  
  const now = referenceDate ? new Date(referenceDate) : new Date();
  
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  
  const pv: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') pv[p.type] = parseInt(p.value, 10);
  }
  
  const ref = new Date(pv.year, pv.month - 1, pv.day, 0, 0, 0, 0);
  
  let scheduledDate: string | null = null;
  let scheduledTime: string | null = null;
  let recurrenceRule: RecurrenceRule | null = null;
  let strippedContent = text;
  let hasExplicitDate = false;
  let hasExplicitTime = false;
  
  // ===== RECURRENCE PATTERNS (FIRST) =====
  
  // "каждый день"
  const dailyMatch = strippedContent.match(/каждый\s+день/i);
  if (dailyMatch) {
    recurrenceRule = 'daily';
    strippedContent = strippedContent.replace(/каждый\s+день/gi, '').trim();
  }
  
  // "по будням"
  const weekdaysMatch = strippedContent.match(/по\s+будням/i);
  if (weekdaysMatch) {
    recurrenceRule = 'weekdays';
    strippedContent = strippedContent.replace(/по\s+будням/gi, '').trim();
  }
  
  // "каждый понедельник" / "каждую пятницу" etc.
  const weeklyMatch = strippedContent.match(/каждый\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)|каждую\s+(среду|пятницу|субботу)/i);
  if (weeklyMatch) {
    recurrenceRule = 'weekly';
    const dayName = (weeklyMatch[1] || weeklyMatch[2]).toLowerCase();
    
    // Map day names to day numbers
    const dayMap: Record<string, number> = {
      'понедельник': 1,
      'вторник': 2,
      'среду': 3,
      'четверг': 4,
      'пятницу': 5,
      'субботу': 6,
      'воскресенье': 0
    };
    
    const dayOfWeek = dayMap[dayName];
    if (dayOfWeek !== undefined) {
      const nextDate = getNextWeekday(dayOfWeek, ref);
      scheduledDate = formatDate(nextDate);
      hasExplicitDate = true;
    }
    
    strippedContent = strippedContent.replace(/каждый\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)|каждую\s+(среду|пятницу|субботу)/gi, '').trim();
  }
  
  // ===== RELATIVE DATE PATTERNS =====
  
  // "послезавтра" (MUST be before "завтра" check!)
  const dayAfterMatch = strippedContent.match(/послезавтра/i);
  if (dayAfterMatch) {
    const dayAfter = new Date(ref);
    dayAfter.setDate(dayAfter.getDate() + 2);
    scheduledDate = formatDate(dayAfter);
    hasExplicitDate = true;
    strippedContent = strippedContent.replace(/послезавтра/gi, '').trim();
  }
  
  // "сегодня"
  if (!hasExplicitDate) {
    const todayMatch = strippedContent.match(/сегодня/i);
    if (todayMatch) {
      scheduledDate = formatDate(ref);
      hasExplicitDate = true;
      strippedContent = strippedContent.replace(/сегодня/gi, '').trim();
    }
  }
  
  // "завтра"
  if (!hasExplicitDate) {
    const tomorrowMatch = strippedContent.match(/завтра/i);
    if (tomorrowMatch) {
      const tomorrow = new Date(ref);
      tomorrow.setDate(tomorrow.getDate() + 1);
      scheduledDate = formatDate(tomorrow);
      hasExplicitDate = true;
      strippedContent = strippedContent.replace(/завтра/gi, '').trim();
    }
  }
  
  // ===== WEEKDAY PATTERNS =====
  
  if (!hasExplicitDate) {
    // "в понедельник" / "во вторник" etc.
    const weekdayMatch = strippedContent.match(/в(?:о)?\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/i);
    if (weekdayMatch) {
      const dayName = weekdayMatch[1].toLowerCase();
      
      const dayMap: Record<string, number> = {
        'понедельник': 1,
        'вторник': 2,
        'среду': 3,
        'четверг': 4,
        'пятницу': 5,
        'субботу': 6,
        'воскресенье': 0
      };
      
      const dayOfWeek = dayMap[dayName];
      if (dayOfWeek !== undefined) {
        const nextDate = getNextWeekday(dayOfWeek, ref);
        scheduledDate = formatDate(nextDate);
        hasExplicitDate = true;
      }
      
      strippedContent = strippedContent.replace(/в(?:о)?\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/gi, '').trim();
    }
  }
  
  // ===== DAY OFFSET PATTERNS =====
  
  if (!hasExplicitDate) {
    // "через день" (singular without number = 1 day)
    const singleDayMatch = strippedContent.match(/через\s+день(?!\s*\d)/i);
    if (singleDayMatch) {
      const futureDate = new Date(ref);
      futureDate.setDate(futureDate.getDate() + 1);
      scheduledDate = formatDate(futureDate);
      hasExplicitDate = true;
      strippedContent = strippedContent.replace(/через\s+день(?!\s*\d)/gi, '').trim();
    }
    
    // "через N дней/дня/день"
    if (!hasExplicitDate) {
      const daysOffsetMatch = strippedContent.match(/через\s+(\d+)\s+(?:день|дня|дней)/i);
      if (daysOffsetMatch) {
        const days = parseInt(daysOffsetMatch[1], 10);
        const futureDate = new Date(ref);
        futureDate.setDate(futureDate.getDate() + days);
        scheduledDate = formatDate(futureDate);
        hasExplicitDate = true;
        strippedContent = strippedContent.replace(/через\s+\d+\s+(?:день|дня|дней)/gi, '').trim();
      }
    }
    
    // "через неделю"
    if (!hasExplicitDate) {
      const weekOffsetMatch = strippedContent.match(/через\s+неделю/i);
      if (weekOffsetMatch) {
        const futureDate = new Date(ref);
        futureDate.setDate(futureDate.getDate() + 7);
        scheduledDate = formatDate(futureDate);
        hasExplicitDate = true;
        strippedContent = strippedContent.replace(/через\s+неделю/gi, '').trim();
      }
    }
  }
  
  // ===== TIME PATTERNS =====
  
  // "в HH:MM" or "в H:MM"
  const timeMatch = strippedContent.match(/в\s+(\d{1,2}):(\d{2})/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      scheduledTime = formatTime(hours, minutes);
      hasExplicitTime = true;
    }
    strippedContent = strippedContent.replace(/в\s+\d{1,2}:\d{2}/gi, '').trim();
  }
  
  // "в H часов"
  const hoursMatch = strippedContent.match(/в\s+(\d{1,2})\s+час(?:ов|а)?/i);
  if (hoursMatch && !hasExplicitTime) {
    const hours = parseInt(hoursMatch[1], 10);
    if (hours >= 0 && hours <= 23) {
      scheduledTime = formatTime(hours, 0);
      hasExplicitTime = true;
    }
    strippedContent = strippedContent.replace(/в\s+\d{1,2}\s+час(?:ов|а)?/gi, '').trim();
  }
  
  // "утром"
  const morningMatch = strippedContent.match(/утром/i);
  if (morningMatch && !hasExplicitTime) {
    scheduledTime = '09:00';
    hasExplicitTime = true;
    strippedContent = strippedContent.replace(/утром/gi, '').trim();
  }
  
  // "днём" / "в обед"
  const afternoonMatch = strippedContent.match(/днём|в\s+обед/i);
  if (afternoonMatch && !hasExplicitTime) {
    scheduledTime = '14:00';
    hasExplicitTime = true;
    strippedContent = strippedContent.replace(/днём|в\s+обед/gi, '').trim();
  }
  
  // "вечером"
  const eveningMatch = strippedContent.match(/вечером/i);
  if (eveningMatch && !hasExplicitTime) {
    scheduledTime = '19:00';
    hasExplicitTime = true;
    strippedContent = strippedContent.replace(/вечером/gi, '').trim();
  }
  
  // ===== CALCULATE DEADLINE =====
  
  let deadline: number | null = null;
  if (scheduledDate && scheduledTime) {
    deadline = calculateDeadline(scheduledDate, scheduledTime, tz);
  }
  
  // ===== DETERMINE CONFIDENCE =====
  
  let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
  
  if (hasExplicitDate && hasExplicitTime) {
    confidence = 'high';
  } else if (hasExplicitDate && !hasExplicitTime) {
    confidence = 'medium';
  } else if (!hasExplicitDate && hasExplicitTime) {
    confidence = 'low';
    // Assume today if only time is specified
    scheduledDate = formatDate(ref);
    // Recalculate deadline with today's date
    if (scheduledTime) {
      deadline = calculateDeadline(scheduledDate, scheduledTime, tz);
    }
  }
  
  // Clean up extra whitespace in stripped content
  strippedContent = strippedContent.replace(/\s+/g, ' ').trim();
  
  return {
    scheduledDate,
    scheduledTime,
    deadline,
    recurrenceRule,
    strippedContent,
    confidence
  };
}
