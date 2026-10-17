import { describe, expect, it } from 'vitest';
import type { AnniversaryRecord } from '../types';
import { anniversaryNumberLabel, nextYearlyDate, occurrenceFor, selectNextAnniversary, sortAnniversaries } from './anniversary';

function record(id: string, date: string, recurrence: 'yearly' | 'once', createdAt = `2026-01-0${id.length}T00:00:00.000Z`): AnniversaryRecord {
  return { id, title: id, date, recurrence, createdAt, updatedAt: createdAt };
}

describe('yearly anniversary occurrences', () => {
  it('rolls passed dates into the next year while preserving the original date', () => {
    const item = record('event', '2024-06-24', 'yearly');
    expect(nextYearlyDate(item.date, '2026-06-25')).toBe('2027-06-24');
    expect(occurrenceFor(item, '2026-06-25')).toMatchObject({ nextDate: '2027-06-24', daysUntil: 364, anniversaryNumber: 3, status: '还有 364 天' });
    expect(item.date).toBe('2024-06-24');
  });

  it('handles February 29 on February 28 in common years and February 29 in leap years', () => {
    expect(nextYearlyDate('2024-02-29', '2025-02-27')).toBe('2025-02-28');
    expect(nextYearlyDate('2024-02-29', '2028-02-28')).toBe('2028-02-29');
    expect(occurrenceFor(record('leap', '2024-02-29', 'yearly'), '2025-02-28')).toMatchObject({ nextDate: '2025-02-28', daysUntil: 0, anniversaryNumber: 1, status: '就是今天' });
  });

  it('does not show a negative anniversary for a future original year', () => {
    const upcoming = occurrenceFor(record('future', '2050-01-01', 'yearly'), '2026-12-31');
    expect(upcoming).toMatchObject({ nextDate: '2050-01-01', anniversaryNumber: 0 });
    expect(anniversaryNumberLabel(upcoming.anniversaryNumber)).toBe('首次纪念日');
  });

  it('shows today without a zero-day countdown and calculates calendar-day differences', () => {
    expect(occurrenceFor(record('today', '2026-12-31', 'yearly'), '2026-12-31')).toMatchObject({ daysUntil: 0, status: '就是今天' });
    expect(occurrenceFor(record('tomorrow', '2027-01-01', 'once'), '2026-12-31')).toMatchObject({ daysUntil: 1, status: '还有 1 天' });
  });
});

describe('one-time dates, ordering, and hero selection', () => {
  it('labels one-time dates as future, today, or past', () => {
    expect(occurrenceFor(record('future', '2026-12-31', 'once'), '2026-12-30')).toMatchObject({ daysUntil: 1, status: '还有 1 天' });
    expect(occurrenceFor(record('today', '2026-12-31', 'once'), '2026-12-31')).toMatchObject({ daysUntil: 0, status: '就是今天' });
    expect(occurrenceFor(record('past', '2026-12-30', 'once'), '2026-12-31')).toMatchObject({ daysPast: 1, status: '已过去 1 天' });
  });

  it('places upcoming dates first, past one-time dates in reverse date order, with stable same-day ordering', () => {
    const records = [
      record('old', '2020-01-01', 'once'),
      record('later-past', '2025-12-20', 'once'),
      record('same-b', '2027-06-01', 'once', '2026-01-02T00:00:00.000Z'),
      record('same-a', '2027-06-01', 'yearly', '2026-01-01T00:00:00.000Z'),
      record('near', '2027-01-01', 'once')
    ];
    expect(sortAnniversaries(records, '2026-12-31').map(({ record: item }) => item.id)).toEqual(['near', 'same-a', 'same-b', 'later-past', 'old']);
    expect(selectNextAnniversary(records, '2026-12-31')?.record.id).toBe('near');
    expect(selectNextAnniversary([record('past-only', '2020-01-01', 'once')], '2026-12-31')).toBeNull();
  });
});
