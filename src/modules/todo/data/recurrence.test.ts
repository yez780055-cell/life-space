import { describe, expect, it } from 'vitest';
import type { PersonalTask, RecurrenceRule, TaskOccurrence } from './model';
import { allInstances, nextOccurrenceDate } from './recurrence';

function task(overrides: Partial<PersonalTask> = {}): PersonalTask {
  return {
    id: 'task', title: '任务', note: '旧备注', scheduledDate: '2026-10-01', scheduledTime: null,
    tags: ['old-tag'],
    createdAt: 1, updatedAt: 1, completedAt: null, completionSource: null,
    recurrence: null, recurrenceHistory: [], seriesId: null,
    reminder: { enabled: false, minutesBefore: 10 }, ...overrides
  };
}

function dailyRule(startsOn: RecurrenceRule['startsOn'] = '2020-01-01'): RecurrenceRule {
  return { frequency: 'daily', interval: 1, startsOn, endsOn: null, weekdays: [] };
}

function occurrence(taskId: string, periodDate: TaskOccurrence['periodDate'], overrides: Partial<TaskOccurrence> = {}): TaskOccurrence {
  return {
    key: `${taskId}:${periodDate}`, taskId, periodDate, scheduledDate: periodDate,
    completedAt: null, completionSource: null, override: {}, skipped: false,
    updatedAt: 2, ...overrides
  };
}

describe('all personal task projection', () => {
  it('keeps one-off and undated tasks while projecting only the next open cycle of an infinite series', () => {
    const daily = task({ id: 'daily', seriesId: 'daily', recurrence: dailyRule() });
    const undated = task({ id: 'undated', scheduledDate: null });
    const past = task({ id: 'past', scheduledDate: '2026-10-12' });
    const done = task({ id: 'done', scheduledDate: '2026-10-13', completedAt: 3 });

    const all = allInstances([daily, undated, past, done], [], '2026-10-15');

    expect(all.map((item) => item.instanceKey)).toEqual(['undated', 'past', 'done', 'daily:2026-10-15']);
    expect(all.find((item) => item.instanceKey === 'undated')?.scheduledDate).toBeNull();
    expect(all.filter((item) => item.taskId === 'daily')).toHaveLength(1);
  });

  it('retains completed and explicitly changed cycles, then adds one unrecorded upcoming cycle', () => {
    const daily = task({ id: 'daily', seriesId: 'daily', recurrence: dailyRule() });
    const completed = occurrence('daily', '2026-10-14', { completedAt: 4, completionSource: 'manual' });
    const moved = occurrence('daily', '2026-10-13', {
      scheduledDate: '2026-10-18', override: { scheduledDate: '2026-10-18', title: '改期保留' }
    });

    const all = allInstances([daily], [completed, moved], '2026-10-15');

    expect(all).toHaveLength(3);
    expect(all.map((item) => item.instanceKey)).toEqual(['daily:2026-10-14', 'daily:2026-10-15', 'daily:2026-10-13']);
    expect(all.find((item) => item.instanceKey === 'daily:2026-10-14')?.completedAt).toBe(4);
    expect(all.find((item) => item.instanceKey === 'daily:2026-10-13')).toMatchObject({ title: '改期保留', scheduledDate: '2026-10-18' });
    expect(daily.completedAt).toBeNull();
  });

  it('advances past completed or skipped current cycles without duplicating their records', () => {
    const daily = task({ id: 'daily', seriesId: 'daily', recurrence: dailyRule('2026-10-14') });
    const todayDone = occurrence('daily', '2026-10-15', { completedAt: 5, completionSource: 'manual' });
    const tomorrowSkipped = occurrence('daily', '2026-10-16', { skipped: true });

    const all = allInstances([daily], [todayDone, tomorrowSkipped], '2026-10-15');

    expect(all.map((item) => item.instanceKey)).toEqual(['daily:2026-10-15', 'daily:2026-10-17']);
  });

  it('keeps completed periods from earlier recurrence rule versions', () => {
    const oldRule = dailyRule('2026-10-01');
    oldRule.endsOn = '2026-10-14';
    const series = task({
      id: 'series', seriesId: 'series', scheduledDate: '2026-10-15',
      recurrence: { frequency: 'weekly', interval: 1, startsOn: '2026-10-15', endsOn: null, weekdays: [4] },
      recurrenceHistory: [oldRule]
    });
    const oldDone = occurrence('series', '2026-10-14', { completedAt: 6, completionSource: 'manual' });

    const all = allInstances([series], [oldDone], '2026-10-15');

    expect(all.map((item) => item.instanceKey)).toEqual(['series:2026-10-14', 'series:2026-10-15']);
    expect(all[0].completedAt).toBe(6);
    expect(series.recurrenceHistory[0].endsOn).toBe('2026-10-14');
  });

  it('calculates daily, selected weekly, and sparse monthly next dates without scanning a whole history', () => {
    expect(nextOccurrenceDate(dailyRule('2000-01-01'), '2026-10-15')).toBe('2026-10-15');
    expect(nextOccurrenceDate({ frequency: 'weekly', interval: 2, startsOn: '2026-10-12', endsOn: null, weekdays: [1, 3] }, '2026-10-15')).toBe('2026-10-26');
    expect(nextOccurrenceDate({ frequency: 'weekly', interval: 1, startsOn: '2026-10-12', endsOn: null, weekdays: [0, 1] }, '2026-10-12')).toBe('2026-10-12');
    expect(nextOccurrenceDate({ frequency: 'monthly', interval: 1, startsOn: '2026-01-31', endsOn: null, weekdays: [] }, '2026-02-01')).toBe('2026-03-31');
    expect(nextOccurrenceDate({ ...dailyRule('2026-10-10'), endsOn: '2026-10-14' }, '2026-10-15')).toBeNull();
  });
});
