import { describe, expect, it } from 'vitest';
import type { DateKey } from '../data/model';
import { filterCoupleHistory, filterCoupleItemsByTags, historyBounds, sortOpenCoupleItems, validateHistoryRange } from './domain';
import { validateCoupleItemDraft, validateDateKey, type CoupleHistoryRange, type CoupleItem } from './model';

function item(overrides: Partial<CoupleItem> = {}): CoupleItem {
  return {
    id: 'item', title: '一起做点事', scheduledDate: null, scheduledTime: null, tags: [], note: '',
    createdAt: 1, updatedAt: 1, completedAt: null, revision: 1, ...overrides
  };
}

const date = (value: string) => value as DateKey;

describe('couple task domain', () => {
  it('sorts planned date/time ascending and leaves untimed tasks last on that date', () => {
    const rows = [
      item({ id: 'untimed', scheduledDate: date('2026-10-16'), createdAt: 1 }),
      item({ id: 'late', scheduledDate: date('2026-10-16'), scheduledTime: '20:00', createdAt: 2 }),
      item({ id: 'early', scheduledDate: date('2026-10-16'), scheduledTime: '09:30', createdAt: 3 }),
      item({ id: 'tomorrow', scheduledDate: date('2026-10-17'), scheduledTime: '08:00' }),
      item({ id: 'done', scheduledDate: date('2026-10-15'), completedAt: 123 }),
      item({ id: 'new', createdAt: 20 }), item({ id: 'old', createdAt: 10 })
    ];
    const sorted = sortOpenCoupleItems(rows);
    expect(sorted.planned.map((row) => row.id)).toEqual(['early', 'late', 'untimed', 'tomorrow']);
    expect(sorted.unplanned.map((row) => row.id)).toEqual(['new', 'old']);
  });

  it('uses OR matching for tags and treats no selection as all items', () => {
    const rows = [item({ id: 'a', tags: ['date'] }), item({ id: 'b', tags: ['home'] }), item({ id: 'c', tags: [] })];
    expect(filterCoupleItemsByTags(rows, [])).toEqual(rows);
    expect(filterCoupleItemsByTags(rows, ['date', 'home']).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it.each([7, 30, 90, 180, 365] as const)('builds a local inclusive %i-day window', (days) => {
    const now = new Date(2026, 9, 16, 12, 30);
    const bounds = historyBounds({ kind: 'preset', days }, now);
    const start = new Date(2026, 9, 17 - days).getTime();
    const endExclusive = new Date(2026, 9, 17).getTime();
    expect(bounds).toEqual({ start, endExclusive });
  });

  it('includes both local dates in a custom range and applies the same OR tag filter', () => {
    const range: CoupleHistoryRange = { kind: 'custom', start: date('2026-10-10'), end: date('2026-10-11') };
    const start = new Date(2026, 9, 10).getTime();
    const end = new Date(2026, 9, 12).getTime();
    const rows = [
      item({ id: 'start', completedAt: start, tags: ['one'] }),
      item({ id: 'end', completedAt: end - 1, tags: ['two'] }),
      item({ id: 'before', completedAt: start - 1, tags: ['one'] }),
      item({ id: 'after', completedAt: end, tags: ['one'] })
    ];
    expect(filterCoupleHistory(rows, ['one', 'two'], range).map((row) => row.id)).toEqual(['end', 'start']);
    expect(filterCoupleHistory(rows, ['one'], range).map((row) => row.id)).toEqual(['start']);
  });

  it('rejects invalid calendar dates and reversed or malformed custom ranges', () => {
    expect(validateDateKey('2024-02-29')).toBe(true);
    expect(validateDateKey('2025-02-29')).toBe(false);
    expect(validateDateKey('2026-2-01')).toBe(false);
    expect(validateHistoryRange({ kind: 'custom', start: date('2026-10-12'), end: date('2026-10-11') })).toContain('不能早于');
    expect(validateHistoryRange({ kind: 'custom', start: date('2026-02-30'), end: date('2026-03-01') })).toContain('有效');
    expect(validateCoupleItemDraft({ title: '  ', scheduledDate: null, scheduledTime: null, tags: [], note: '' })).toContain('标题');
    expect(validateCoupleItemDraft({ title: '事项', scheduledDate: null, scheduledTime: '10:00', tags: [], note: '' })).toContain('日期');
  });
});
