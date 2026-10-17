import type { AnniversaryDate } from '../types';

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export const DAY_MS = 86_400_000;

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12 || !Number.isInteger(month)) return 0;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseDateKey(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidDateKey(value: string): value is AnniversaryDate {
  return parseDateKey(value) !== null;
}

export function dateKeyFromParts({ year, month, day }: DateParts): AnniversaryDate {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError('日期超出支持范围');
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function localTodayKey(now = new Date()): AnniversaryDate {
  return dateKeyFromParts({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function millisecondsToNextLocalMidnight(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, midnight.getTime() - now.getTime());
}

function daysBeforeYear(year: number): number {
  const previous = year - 1;
  return previous * 365 + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400);
}

/** A timezone-free integer for a Gregorian calendar day. */
export function dateOrdinal(value: AnniversaryDate): number {
  const parts = parseDateKey(value);
  if (!parts) throw new RangeError('日期格式无效');
  const monthOffsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const beforeMonth = monthOffsets[parts.month - 1] + (parts.month > 2 && isLeapYear(parts.year) ? 1 : 0);
  return daysBeforeYear(parts.year) + beforeMonth + parts.day - 1;
}

export function calendarDayDifference(from: AnniversaryDate, to: AnniversaryDate): number {
  return dateOrdinal(to) - dateOrdinal(from);
}

export function compareDateKeys(left: AnniversaryDate, right: AnniversaryDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function formatDateKey(value: AnniversaryDate, options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }): string {
  const parts = parseDateKey(value);
  if (!parts) return value;
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', ...options }).format(date);
}
