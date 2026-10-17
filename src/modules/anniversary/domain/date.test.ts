import { describe, expect, it } from 'vitest';
import { calendarDayDifference, dateOrdinal, formatDateKey, isLeapYear, isValidDateKey, localTodayKey, millisecondsToNextLocalMidnight, parseDateKey } from './date';

describe('anniversary local calendar dates', () => {
  it('strictly validates local date keys without UTC rollover', () => {
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey('2025-02-29')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-2-01')).toBe(false);
    expect(parseDateKey('2026-10-17')).toEqual({ year: 2026, month: 10, day: 17 });
    expect(localTodayKey(new Date(2026, 9, 17, 0, 15))).toBe('2026-10-17');
  });

  it('counts Gregorian calendar days across months, leap days, and year boundaries', () => {
    expect(calendarDayDifference('2026-01-31', '2026-02-01')).toBe(1);
    expect(calendarDayDifference('2024-02-28', '2024-03-01')).toBe(2);
    expect(calendarDayDifference('2023-12-31', '2024-01-01')).toBe(1);
    expect(dateOrdinal('2026-01-01')).toBe(dateOrdinal('2025-12-31') + 1);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });

  it('formats dates without JavaScript remapping years 1–99', () => {
    expect(isValidDateKey('0001-01-01')).toBe(true);
    expect(() => dateOrdinal('0001-01-01')).not.toThrow();
    expect(formatDateKey('0001-01-01')).toBe('1年1月1日');
  });

  it('recalibrates at local midnight across month and year boundaries', () => {
    const monthEnd = new Date(2026, 9, 31, 23, 59);
    const dayAfterMonthEnd = new Date(monthEnd.getTime() + millisecondsToNextLocalMidnight(monthEnd));
    expect(localTodayKey(dayAfterMonthEnd)).toBe('2026-11-01');
    expect(millisecondsToNextLocalMidnight(monthEnd)).toBe(60_000);

    const yearEnd = new Date(2026, 11, 31, 23, 59);
    const firstDay = new Date(yearEnd.getTime() + millisecondsToNextLocalMidnight(yearEnd));
    expect(localTodayKey(firstDay)).toBe('2027-01-01');
    expect(calendarDayDifference('2026-03-08', '2026-03-09')).toBe(1);
  });
});
