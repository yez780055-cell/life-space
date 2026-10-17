import type { AnniversaryDate, AnniversaryRecord } from '../types';
import { calendarDayDifference, compareDateKeys, dateKeyFromParts, isLeapYear, parseDateKey } from './date';

export interface AnniversaryOccurrence {
  nextDate: AnniversaryDate | null;
  daysUntil: number | null;
  daysPast: number | null;
  anniversaryNumber: number | null;
  status: string;
}

export interface SortedAnniversary extends AnniversaryOccurrence {
  record: AnniversaryRecord;
}

function sameMonthDayInYear(recordDate: AnniversaryDate, year: number): AnniversaryDate | null {
  const parts = parseDateKey(recordDate);
  if (!parts || year < 1 || year > 9999) return null;
  const day = parts.month === 2 && parts.day === 29 && !isLeapYear(year) ? 28 : parts.day;
  return dateKeyFromParts({ year, month: parts.month, day });
}

export function nextYearlyDate(recordDate: AnniversaryDate, today: AnniversaryDate): AnniversaryDate | null {
  const original = parseDateKey(recordDate), current = parseDateKey(today);
  if (!original || !current) throw new RangeError('日期格式无效');
  let year = Math.max(original.year, current.year);
  let candidate = sameMonthDayInYear(recordDate, year);
  if (candidate && compareDateKeys(candidate, today) < 0) candidate = sameMonthDayInYear(recordDate, ++year);
  return candidate;
}

export function occurrenceFor(record: AnniversaryRecord, today: AnniversaryDate): AnniversaryOccurrence {
  if (!parseDateKey(record.date) || !parseDateKey(today)) throw new RangeError('日期格式无效');
  if (record.recurrence === 'once') {
    const difference = calendarDayDifference(today, record.date);
    if (difference > 0) return { nextDate: record.date, daysUntil: difference, daysPast: null, anniversaryNumber: null, status: `还有 ${difference} 天` };
    if (difference === 0) return { nextDate: record.date, daysUntil: 0, daysPast: null, anniversaryNumber: null, status: '就是今天' };
    const daysPast = -difference;
    return { nextDate: null, daysUntil: null, daysPast, anniversaryNumber: null, status: `已过去 ${daysPast} 天` };
  }

  if (record.recurrence !== 'yearly') throw new RangeError('纪念日类型无效');
  const original = parseDateKey(record.date)!;
  const nextDate = nextYearlyDate(record.date, today);
  if (!nextDate) return { nextDate: null, daysUntil: null, daysPast: null, anniversaryNumber: null, status: '没有可用的后续日期' };
  const daysUntil = calendarDayDifference(today, nextDate);
  const occurrenceYear = parseDateKey(nextDate)!.year;
  const anniversaryNumber = Math.max(0, occurrenceYear - original.year);
  return {
    nextDate,
    daysUntil,
    daysPast: null,
    anniversaryNumber,
    status: daysUntil === 0 ? '就是今天' : `还有 ${daysUntil} 天`
  };
}

function stableTieBreak(left: AnniversaryRecord, right: AnniversaryRecord): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export function sortAnniversaries(records: AnniversaryRecord[], today: AnniversaryDate): SortedAnniversary[] {
  return records.map((record) => ({ record, ...occurrenceFor(record, today) })).sort((left, right) => {
    const leftUpcoming = left.nextDate !== null;
    const rightUpcoming = right.nextDate !== null;
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    if (leftUpcoming && rightUpcoming) {
      const byNextDate = compareDateKeys(left.nextDate!, right.nextDate!);
      return byNextDate || stableTieBreak(left.record, right.record);
    }
    const byPastDate = compareDateKeys(right.record.date, left.record.date);
    return byPastDate || stableTieBreak(left.record, right.record);
  });
}

export function selectNextAnniversary(records: AnniversaryRecord[], today: AnniversaryDate): SortedAnniversary | null {
  return sortAnniversaries(records, today).find((item) => item.nextDate !== null) ?? null;
}

export function anniversaryNumberLabel(number: number | null): string | null {
  if (number === null) return null;
  return number === 0 ? '首次纪念日' : `第 ${number} 周年`;
}
