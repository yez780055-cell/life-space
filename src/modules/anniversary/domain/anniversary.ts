import type { AnniversaryDate, AnniversaryRecord } from '../types';
import { calendarDayDifference, compareDateKeys, dateKeyFromParts, dateOrdinal, isLeapYear, LAST_SUPPORTED_DATE, parseDateKey, addCalendarDays } from './date';
import { milestoneDate, normalizeMilestoneDays } from './milestones';
import type { AnniversaryIconKey } from '../icons';

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

export type AnniversaryUpcomingEventKind = 'yearly' | 'once' | 'milestone';

export interface AnniversaryUpcomingEvent {
  id: string;
  recordId: string;
  createdAt: string;
  date: AnniversaryDate;
  title: string;
  icon: AnniversaryIconKey;
  kind: AnniversaryUpcomingEventKind;
  kinds: AnniversaryUpcomingEventKind[];
  label: string;
  milestoneDay?: number;
  anniversaryNumber?: number;
}

export interface AnniversaryUpcomingWeek {
  anchor: AnniversaryUpcomingEvent | null;
  weekEvents: AnniversaryUpcomingEvent[];
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

const eventKindOrder: Record<AnniversaryUpcomingEventKind, number> = { yearly: 0, once: 1, milestone: 2 };

function compareUpcomingEvents(left: AnniversaryUpcomingEvent, right: AnniversaryUpcomingEvent): number {
  return compareDateKeys(left.date, right.date)
    || left.createdAt.localeCompare(right.createdAt)
    || left.recordId.localeCompare(right.recordId)
    || eventKindOrder[left.kind] - eventKindOrder[right.kind]
    || left.id.localeCompare(right.id);
}

/** Creates and groups every today-or-future yearly, once, and custom day event. */
export function buildUpcomingEvents(records: AnniversaryRecord[], today: AnniversaryDate): AnniversaryUpcomingEvent[] {
  if (!parseDateKey(today)) throw new RangeError('日期格式无效');
  const candidates: AnniversaryUpcomingEvent[] = [];

  for (const record of records) {
    if (!parseDateKey(record.date)) throw new RangeError('日期格式无效');
    if (record.recurrence === 'yearly') {
      const occurrence = occurrenceFor(record, today);
      if (occurrence.nextDate) {
        candidates.push({
          id: `${record.id}:${occurrence.nextDate}:yearly`, recordId: record.id, createdAt: record.createdAt,
          date: occurrence.nextDate, title: record.title, icon: record.icon, kind: 'yearly', kinds: ['yearly'],
          label: anniversaryNumberLabel(occurrence.anniversaryNumber) ?? '纪念日',
          ...(occurrence.anniversaryNumber !== null ? { anniversaryNumber: occurrence.anniversaryNumber } : {})
        });
      }
    } else if (record.recurrence === 'once') {
      if (compareDateKeys(record.date, today) >= 0) {
        candidates.push({ id: `${record.id}:${record.date}:once`, recordId: record.id, createdAt: record.createdAt, date: record.date, title: record.title, icon: record.icon, kind: 'once', kinds: ['once'], label: '一次性纪念' });
      }
    } else {
      throw new RangeError('纪念日类型无效');
    }

    if (!record.milestoneEnabled) continue;
    for (const milestoneDay of normalizeMilestoneDays(record.milestoneDays, record.date)) {
      const date = milestoneDate(record.date, milestoneDay);
      if (compareDateKeys(date, today) < 0) continue;
      candidates.push({ id: `${record.id}:${date}:milestone:${milestoneDay}`, recordId: record.id, createdAt: record.createdAt, date, title: record.title, icon: record.icon, kind: 'milestone', kinds: ['milestone'], label: `天数节点 · 第 ${milestoneDay} 天`, milestoneDay });
    }
  }

  const sortedCandidates = candidates.sort(compareUpcomingEvents);
  const grouped = new Map<string, AnniversaryUpcomingEvent[]>();
  for (const candidate of sortedCandidates) {
    const key = `${candidate.recordId}\u0000${candidate.date}`;
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  return [...grouped.values()].map((group) => {
    const primary = [...group].sort((left, right) => eventKindOrder[left.kind] - eventKindOrder[right.kind] || left.id.localeCompare(right.id))[0];
    const kinds = [...new Set(group.map((event) => event.kind))].sort((left, right) => eventKindOrder[left] - eventKindOrder[right]);
    const labels = [...new Set(group.map((event) => event.label))];
    const milestone = group.find((event) => event.milestoneDay !== undefined);
    const yearly = group.find((event) => event.anniversaryNumber !== undefined);
    return {
      id: `${primary.recordId}:${primary.date}`,
      recordId: primary.recordId,
      createdAt: primary.createdAt,
      date: primary.date,
      title: primary.title,
      icon: primary.icon,
      kind: primary.kind,
      kinds,
      label: labels.join(' · '),
      ...(milestone?.milestoneDay !== undefined ? { milestoneDay: milestone.milestoneDay } : {}),
      ...(yearly?.anniversaryNumber !== undefined ? { anniversaryNumber: yearly.anniversaryNumber } : {})
    };
  }).sort(compareUpcomingEvents);
}

/** Uses the earliest event as the anchor and includes the next six natural days. */
export function selectUpcomingWeek(events: AnniversaryUpcomingEvent[], today: AnniversaryDate): AnniversaryUpcomingWeek {
  if (!parseDateKey(today)) throw new RangeError('日期格式无效');
  const ordered = events.filter((event) => compareDateKeys(event.date, today) >= 0).sort(compareUpcomingEvents);
  const anchor = ordered[0] ?? null;
  if (!anchor) return { anchor: null, weekEvents: [] };
  const endOrdinal = Math.min(dateOrdinal(anchor.date) + 6, dateOrdinal(LAST_SUPPORTED_DATE));
  const windowEnd = endOrdinal === dateOrdinal(anchor.date) + 6 ? addCalendarDays(anchor.date, 6) : LAST_SUPPORTED_DATE;
  return {
    anchor,
    weekEvents: ordered.filter((event) => event.id !== anchor.id && compareDateKeys(event.date, anchor.date) >= 0 && compareDateKeys(event.date, windowEnd) <= 0)
  };
}

export function selectAnniversaryUpcomingWeek(records: AnniversaryRecord[], today: AnniversaryDate): AnniversaryUpcomingWeek {
  return selectUpcomingWeek(buildUpcomingEvents(records, today), today);
}

export function anniversaryNumberLabel(number: number | null): string | null {
  if (number === null) return null;
  return number === 0 ? '首次纪念日' : `第 ${number} 周年`;
}
