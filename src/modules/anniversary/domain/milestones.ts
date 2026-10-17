import type { AnniversaryDate } from '../types';
import { addCalendarDays, calendarDayDifference, compareDateKeys, dateOrdinal, isValidDateKey, LAST_SUPPORTED_DATE } from './date';

/** A generous product limit; dates are also constrained by the supported calendar range. */
export const MAX_MILESTONE_DAY = 1_000_000;

export interface DayMilestoneSummary {
  currentDay: number | null;
  nextMilestoneDay: number | null;
  nextMilestoneDate: AnniversaryDate | null;
  daysUntilNextMilestone: number | null;
  isMilestoneToday: boolean;
  allCompleted: boolean;
}

export function maximumMilestoneDay(recordDate: AnniversaryDate): number {
  if (!isValidDateKey(recordDate)) throw new RangeError('纪念日日期无效。');
  const daysRemaining = dateOrdinal(LAST_SUPPORTED_DATE) - dateOrdinal(recordDate) + 1;
  return Math.min(MAX_MILESTONE_DAY, daysRemaining);
}

/** Validates, de-duplicates and sorts user-defined positive whole-day milestones. */
export function normalizeMilestoneDays(values: unknown, recordDate?: AnniversaryDate): number[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error('天数节点必须是正整数列表。');
  const maximum = recordDate === undefined ? MAX_MILESTONE_DAY : maximumMilestoneDay(recordDate);
  const unique = new Set<number>();
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      throw new Error('天数节点必须是大于 0 的整数。');
    }
    if (value > maximum) {
      throw new Error(`天数节点不能超过 ${maximum.toLocaleString('zh-CN')} 天；日期最多支持到 9999 年 12 月 31 日。`);
    }
    unique.add(value);
  }
  return [...unique].sort((left, right) => left - right);
}

export function currentMilestoneDay(recordDate: AnniversaryDate, today: AnniversaryDate): number | null {
  if (!isValidDateKey(recordDate) || !isValidDateKey(today)) throw new RangeError('日期格式无效。');
  if (compareDateKeys(today, recordDate) < 0) return null;
  return calendarDayDifference(recordDate, today) + 1;
}

/** Nth day is the original date plus N - 1 Gregorian days. */
export function milestoneDate(recordDate: AnniversaryDate, milestoneDay: number): AnniversaryDate {
  const [day] = normalizeMilestoneDays([milestoneDay], recordDate);
  return addCalendarDays(recordDate, day - 1);
}

export function nextMilestone(
  recordDate: AnniversaryDate,
  today: AnniversaryDate,
  milestoneDays: unknown
): DayMilestoneSummary {
  const currentDay = currentMilestoneDay(recordDate, today);
  const days = normalizeMilestoneDays(milestoneDays, recordDate);
  const nextMilestoneDay = days.find((day) => currentDay === null || day >= currentDay) ?? null;

  if (nextMilestoneDay === null) {
    return {
      currentDay,
      nextMilestoneDay: null,
      nextMilestoneDate: null,
      daysUntilNextMilestone: null,
      isMilestoneToday: false,
      allCompleted: days.length > 0 && currentDay !== null,
    };
  }

  const nextMilestoneDate = milestoneDate(recordDate, nextMilestoneDay);
  return {
    currentDay,
    nextMilestoneDay,
    nextMilestoneDate,
    daysUntilNextMilestone: Math.max(0, calendarDayDifference(today, nextMilestoneDate)),
    isMilestoneToday: currentDay === nextMilestoneDay,
    allCompleted: false,
  };
}
