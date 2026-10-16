import { addDays, fromDateKey } from '../data/dates';
import type { CoupleHistoryRange, CoupleItem } from './model';
import { validateDateKey } from './model';
import type { DateKey } from '../data/model';

export function filterCoupleItemsByTags<T extends Pick<CoupleItem, 'tags'>>(items: T[], selectedTagIds: string[]): T[] {
  if (selectedTagIds.length === 0) return items;
  const selected = new Set(selectedTagIds);
  return items.filter((item) => item.tags.some((tagId) => selected.has(tagId)));
}

function compareDateAndTime(a: CoupleItem, b: CoupleItem): number {
  const dateOrder = (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '');
  if (dateOrder !== 0) return dateOrder;
  // An item without a specific time is consistently placed after timed items on that date.
  const timeOrder = (a.scheduledTime ?? '23:59:59').localeCompare(b.scheduledTime ?? '23:59:59');
  if (timeOrder !== 0) return timeOrder;
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

export function sortOpenCoupleItems(items: CoupleItem[]): { planned: CoupleItem[]; unplanned: CoupleItem[] } {
  const open = items.filter((item) => item.completedAt === null);
  const planned = open.filter((item) => item.scheduledDate !== null).sort(compareDateAndTime);
  const unplanned = open.filter((item) => item.scheduledDate === null)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  return { planned, unplanned };
}

export function localDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` as DateKey;
}

export function validateHistoryRange(range: CoupleHistoryRange): string | null {
  if (range.kind === 'preset') return [7, 30, 90, 180, 365].includes(range.days) ? null : '请选择有效的时间范围。';
  if (!validateDateKey(range.start) || !validateDateKey(range.end)) return '请选择有效的开始和结束日期。';
  if (range.start > range.end) return '结束日期不能早于开始日期。';
  return null;
}

export function historyBounds(range: CoupleHistoryRange, now = new Date()): { start: number; endExclusive: number } {
  const error = validateHistoryRange(range);
  if (error) throw new Error(error);
  const today = localDateKey(now);
  const first = range.kind === 'preset' ? addDays(today, 1 - range.days) : range.start;
  const last = range.kind === 'preset' ? today : range.end;
  const startDate = fromDateKey(first);
  const endDate = fromDateKey(addDays(last, 1));
  return {
    start: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime(),
    endExclusive: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
  };
}

export function filterCoupleHistory(items: CoupleItem[], selectedTagIds: string[], range: CoupleHistoryRange, now = new Date()): CoupleItem[] {
  const bounds = historyBounds(range, now);
  return filterCoupleItemsByTags(items.filter((item) => item.completedAt !== null
    && item.completedAt >= bounds.start && item.completedAt < bounds.endExclusive), selectedTagIds)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) || b.id.localeCompare(a.id));
}

export function formatCoupleDate(dateKey: DateKey): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    .format(fromDateKey(dateKey)).replace('星期', '周');
}

export function formatCompletedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(timestamp));
}
