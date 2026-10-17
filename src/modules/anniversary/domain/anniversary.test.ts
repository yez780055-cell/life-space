import { describe, expect, it } from 'vitest';
import type { AnniversaryRecord } from '../types';
import { anniversaryNumberLabel, buildUpcomingEvents, nextYearlyDate, occurrenceFor, selectAnniversaryUpcomingWeek, selectNextAnniversary, selectUpcomingWeek, sortAnniversaries } from './anniversary';
import { addCalendarDays } from './date';

function record(id: string, date: string, recurrence: 'yearly' | 'once', createdAt = `2026-01-0${id.length}T00:00:00.000Z`): AnniversaryRecord {
  return { id, title: id, date, recurrence, milestoneEnabled: false, milestoneDays: [], createdAt, updatedAt: createdAt };
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

describe('unified upcoming Anniversary events', () => {
  it('builds yearly, today/future once, and every enabled today/future milestone candidate', () => {
    const today = '2026-10-17';
    const milestoneStart = addCalendarDays(today, -10);
    const records = [
      { ...record('yearly', '2026-11-02', 'yearly'), title: '年度' },
      { ...record('once-today', today, 'once'), title: '今天' },
      { ...record('once-future', '2026-10-20', 'once'), title: '未来一次' },
      { ...record('once-past', '2026-10-16', 'once'), title: '过去一次' },
      { ...record('off', milestoneStart, 'once'), milestoneEnabled: false, milestoneDays: [10, 11, 12] },
      { ...record('milestones', milestoneStart, 'once'), milestoneEnabled: true, milestoneDays: [5, 11, 12, 20] }
    ];
    const events = buildUpcomingEvents(records, today);
    expect(events.map((event) => [event.title, event.date, event.kind, event.milestoneDay])).toEqual([
      ['milestones', today, 'milestone', 11],
      ['今天', today, 'once', undefined],
      ['milestones', '2026-10-18', 'milestone', 12],
      ['未来一次', '2026-10-20', 'once', undefined],
      ['milestones', '2026-10-26', 'milestone', 20],
      ['年度', '2026-11-02', 'yearly', undefined]
    ]);
    expect(events.find((event) => event.recordId === 'milestones')?.label).toContain('第 11 天');
    expect(events.some((event) => event.recordId === 'off')).toBe(false);
    expect(events.some((event) => event.recordId === 'once-past')).toBe(false);
  });

  it('selects the earliest event of each kind, lets today lead, and includes the anchor day through day six only', () => {
    const today = '2026-10-17';
    const createdAt = '2026-01-01T00:00:00.000Z';
    const events = [
      { ...record('day7', '2026-10-24', 'once'), createdAt },
      { ...record('day6', '2026-10-23', 'once'), createdAt },
      { ...record('day0', today, 'once'), createdAt },
      { ...record('day1', '2026-10-18', 'once'), createdAt }
    ];
    const week = selectAnniversaryUpcomingWeek(events, today);
    expect(week.anchor).toMatchObject({ recordId: 'day0', date: today, kind: 'once' });
    expect(week.weekEvents.map((event) => event.recordId)).toEqual(['day1', 'day6']);

    const annual = record('annual-anchor', '2026-10-19', 'yearly');
    const once = record('once-anchor', '2026-10-19', 'once');
    const start = addCalendarDays(today, -20);
    const milestone = { ...record('milestone-anchor', start, 'once'), milestoneEnabled: true, milestoneDays: [22] };
    expect(selectAnniversaryUpcomingWeek([annual], today).anchor?.kind).toBe('yearly');
    expect(selectAnniversaryUpcomingWeek([once], today).anchor?.kind).toBe('once');
    expect(selectAnniversaryUpcomingWeek([milestone], today).anchor).toMatchObject({ kind: 'milestone', milestoneDay: 22, date: '2026-10-18' });
    expect(selectAnniversaryUpcomingWeek([annual, milestone], today).anchor?.kind).toBe('milestone');
    expect(selectUpcomingWeek([], today)).toEqual({ anchor: null, weekEvents: [] });
  });

  it('forms the six-day window relative to a distant anchor and keeps all same-day records stable', () => {
    const today = '2026-10-17';
    const anchorDate = '2026-11-05';
    const node500 = { ...record('a500', addCalendarDays(anchorDate, -499), 'once', '2026-01-01T00:00:00.000Z'), title: '500 天节点', milestoneEnabled: true, milestoneDays: [500] };
    const yearly = record('b-year', '2026-11-07', 'yearly', '2026-01-02T00:00:00.000Z');
    const node520 = { ...record('c520', addCalendarDays('2026-11-10', -519), 'once', '2026-01-03T00:00:00.000Z'), title: '520 天节点', milestoneEnabled: true, milestoneDays: [520] };
    const outside = record('d-out', '2026-11-15', 'once', '2026-01-04T00:00:00.000Z');
    const sameDayB = record('z-same', anchorDate, 'once', '2026-01-02T00:00:00.000Z');
    const sameDayA = record('a-same', anchorDate, 'once', '2026-01-01T00:00:00.000Z');
    const week = selectAnniversaryUpcomingWeek([outside, node520, yearly, node500], today);
    expect(week.anchor).toMatchObject({ date: anchorDate, title: '500 天节点', kind: 'milestone', milestoneDay: 500 });
    expect(week.weekEvents.map((event) => [event.date, event.title])).toEqual([['2026-11-07', 'b-year'], ['2026-11-10', '520 天节点']]);
    expect(week.weekEvents.some((event) => event.recordId === outside.id)).toBe(false);
    const sameDayWeek = selectUpcomingWeek(buildUpcomingEvents([sameDayB, sameDayA], today), today);
    expect(sameDayWeek.anchor?.recordId).toBe('a-same');
    expect(sameDayWeek.weekEvents.map((event) => event.recordId)).toEqual(['z-same']);
  });

  it('groups same-record same-date yearly/milestone and once/milestone semantics without losing labels', () => {
    const yearlyAndMilestone = { ...record('same-year', '2024-01-01', 'yearly'), milestoneEnabled: true, milestoneDays: [732] };
    const mergedYearly = buildUpcomingEvents([yearlyAndMilestone], '2025-12-31').find((event) => event.date === '2026-01-01');
    expect(mergedYearly).toMatchObject({ kind: 'yearly', kinds: ['yearly', 'milestone'], anniversaryNumber: 2, milestoneDay: 732, label: '第 2 周年 · 天数节点 · 第 732 天' });
    const onceAndMilestone = { ...record('same-once', '2026-11-01', 'once'), milestoneEnabled: true, milestoneDays: [1] };
    const mergedOnce = buildUpcomingEvents([onceAndMilestone], '2026-10-17').find((event) => event.date === '2026-11-01');
    expect(mergedOnce).toMatchObject({ kind: 'once', kinds: ['once', 'milestone'], milestoneDay: 1, label: '一次性纪念 · 天数节点 · 第 1 天' });
  });
});
