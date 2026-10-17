import { describe, expect, it } from 'vitest';
import { addCalendarDays, calendarDayDifference, dateKeyFromOrdinal, dateOrdinal } from './date';
import { currentMilestoneDay, MAX_MILESTONE_DAY, milestoneDate, nextMilestone, normalizeMilestoneDays } from './milestones';

describe('custom day milestone normalization', () => {
  it('defaults missing values to an empty list and sorts and de-duplicates positive days', () => {
    expect(normalizeMilestoneDays(undefined)).toEqual([]);
    expect(normalizeMilestoneDays([])).toEqual([]);
    expect(normalizeMilestoneDays([520, 500, 666, 520, 1, 1001])).toEqual([1, 500, 520, 666, 1001]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid day value %s', (value) => {
    expect(() => normalizeMilestoneDays([value])).toThrow('大于 0 的整数');
  });

  it('applies the explicit product cap and prevents dates beyond year 9999', () => {
    expect(() => normalizeMilestoneDays([MAX_MILESTONE_DAY + 1])).toThrow('不能超过');
    expect(() => normalizeMilestoneDays([2], '9999-12-31')).toThrow('不能超过 1 天');
    expect(normalizeMilestoneDays([1], '9999-12-31')).toEqual([1]);
  });
});

describe('inclusive current day count and Gregorian node dates', () => {
  it('counts the original day as day one and does not return a negative count for a future date', () => {
    expect(currentMilestoneDay('2024-03-01', '2024-03-01')).toBe(1);
    expect(currentMilestoneDay('2024-03-01', '2024-03-02')).toBe(2);
    expect(currentMilestoneDay('2024-01-01', '2025-05-14')).toBe(500);
    expect(currentMilestoneDay('2027-01-01', '2026-12-31')).toBeNull();
  });

  it('uses local calendar ordinals across month ends, year ends, leap days and DST transition dates', () => {
    expect(addCalendarDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addCalendarDays('2023-12-31', 1)).toBe('2024-01-01');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(currentMilestoneDay('2026-03-07', '2026-03-09')).toBe(3);
    expect(currentMilestoneDay('2026-10-31', '2026-11-02')).toBe(3);
    expect(calendarDayDifference('2026-03-07', '2026-03-09')).toBe(2);
    expect(dateKeyFromOrdinal(dateOrdinal('2024-02-29'))).toBe('2024-02-29');
  });

  it('calculates day 1, 500, 520, 1000 and 1314 by adding N minus one Gregorian days', () => {
    expect(milestoneDate('2024-02-29', 1)).toBe('2024-02-29');
    expect(milestoneDate('2024-02-29', 500)).toBe('2025-07-12');
    expect(milestoneDate('2024-02-29', 520)).toBe('2025-08-01');
    expect(milestoneDate('2024-02-29', 1000)).toBe('2026-11-24');
    expect(milestoneDate('2024-02-29', 1314)).toBe('2027-10-04');
    expect(milestoneDate('2024-12-31', 2)).toBe('2025-01-01');
  });
});

describe('next custom day milestone', () => {
  const start = '2024-01-01';

  it('selects the first unpassed node, keeps an equal node for today, and rolls past nodes forward', () => {
    expect(nextMilestone(start, '2025-04-30', [500, 520, 600])).toMatchObject({ currentDay: 486, nextMilestoneDay: 500, isMilestoneToday: false, allCompleted: false });
    expect(nextMilestone(start, '2025-05-14', [500, 520, 600])).toMatchObject({ currentDay: 500, nextMilestoneDay: 500, daysUntilNextMilestone: 0, isMilestoneToday: true });
    expect(nextMilestone(start, '2025-05-15', [500, 520, 600])).toMatchObject({ currentDay: 501, nextMilestoneDay: 520, isMilestoneToday: false });
    expect(nextMilestone(start, '2025-08-22', [600, 500, 520, 520])).toMatchObject({ currentDay: 600, nextMilestoneDay: 600, isMilestoneToday: true });
    expect(nextMilestone(start, '2025-08-23', [500, 520, 600])).toMatchObject({ currentDay: 601, nextMilestoneDay: null, nextMilestoneDate: null, allCompleted: true });
  });

  it('normalizes unsorted duplicate nodes and handles a future start without negative values', () => {
    expect(nextMilestone(start, '2025-05-14', [600, 500, 520, 520])).toMatchObject({ nextMilestoneDay: 500, nextMilestoneDate: '2025-05-14' });
    expect(nextMilestone('2027-01-01', '2026-12-31', [1, 500])).toMatchObject({ currentDay: null, nextMilestoneDay: 1, nextMilestoneDate: '2027-01-01', daysUntilNextMilestone: 1, isMilestoneToday: false });
    expect(nextMilestone(start, '2025-05-15', [])).toMatchObject({ currentDay: 501, nextMilestoneDay: null, allCompleted: false });
  });
});
