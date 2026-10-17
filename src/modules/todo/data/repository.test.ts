import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, resetDatabaseConnectionForTests } from '../../../shared/storage/database';
import { addDays, monthGridKeys, startOfWeek, toDateKey } from './dates';
import type { PersonalTask } from './model';
import { occurrencesInRange, occursOn } from './recurrence';
import { reminderSchedule } from './reminders';
import { todoRepository } from './repository';

async function clearDb() {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(clearDb);

function draft(overrides: Partial<Parameters<typeof todoRepository.saveTask>[0]> = {}): Parameters<typeof todoRepository.saveTask>[0] {
  return {
    title: '整理桌面', note: '', scheduledDate: null, scheduledTime: null, tags: [], subtasks: [], recurrence: null, recurrenceHistory: [],
    reminder: { enabled: false, minutesBefore: 10 }, ...overrides
  };
}

describe('personal task repository', () => {
  it('persists a quick inbox task, edits it without changing its stable ID, and reloads it', async () => {
    const first = await todoRepository.createQuickTask('  买洗衣液  ');
    expect(first.title).toBe('买洗衣液');
    expect(first.scheduledDate).toBeNull();
    const changed = await todoRepository.saveTask({ ...first, scheduledDate: '2026-10-16', scheduledTime: '19:30', note: '补充装' });
    expect(changed.id).toBe(first.id);
    expect(await todoRepository.listTasks()).toEqual([changed]);
    expect((await todoRepository.listTasks())[0].scheduledDate).toBe('2026-10-16');
  });

  it('validates empty titles and date/time/recurrence/reminder combinations', async () => {
    await expect(todoRepository.createQuickTask('  ')).rejects.toThrow('标题');
    await expect(todoRepository.saveTask(draft({ scheduledTime: '08:30' }))).rejects.toThrow('选择日期');
    await expect(todoRepository.saveTask(draft({ recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-14', endsOn: null, weekdays: [] } }))).rejects.toThrow('开始日期');
    await expect(todoRepository.saveTask(draft({ scheduledDate: '2026-10-14', reminder: { enabled: true, minutesBefore: 10 } }))).rejects.toThrow('具体时间');
  });

  it('moves a task between the inbox and a date without creating a second entity', async () => {
    const inbox = await todoRepository.createQuickTask('打电话');
    await todoRepository.saveTask({ ...inbox, scheduledDate: '2026-10-15' });
    await todoRepository.saveTask({ ...inbox, scheduledDate: null, scheduledTime: null });
    expect(await todoRepository.listTasks()).toHaveLength(1);
    expect((await todoRepository.listTasks())[0].scheduledDate).toBeNull();
  });

  it('stores completion timestamps and keeps the completed task in its original date', async () => {
    const task = await todoRepository.saveTask(draft({ scheduledDate: '2026-10-14' }));
    await todoRepository.setCompleted(task.id, null, true);
    const done = (await todoRepository.listTasks())[0];
    expect(done.scheduledDate).toBe('2026-10-14');
    expect(done.completedAt).toBeTypeOf('number');
    expect(done.completionSource).toBe('manual');
    await todoRepository.setCompleted(task.id, null, false);
    expect((await todoRepository.listTasks())[0].completedAt).toBeNull();
  });

  it('keeps daily cycles separate, preserves completed history, and does not carry yesterday into today', async () => {
    const task = await todoRepository.saveTask(draft({
      title: '喝水', scheduledDate: '2026-10-12',
      recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-12', endsOn: null, weekdays: [] }
    }));
    await todoRepository.setCompleted(task.id, '2026-10-13', true);
    const instances = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-14', '2026-10-15');
    expect(instances.map((item) => item.periodDate)).toEqual(['2026-10-14', '2026-10-15']);
    expect(instances.every((item) => item.completedAt === null)).toBe(true);
    const yesterday = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-13')[0];
    expect(yesterday.completedAt).toBeTypeOf('number');
    expect((await todoRepository.listOccurrences())).toHaveLength(1);
  });

  it('supports selected weekdays, interval weeks, and skips invalid monthly dates', () => {
    const weekly = { ...baseTask('2026-10-12'), recurrence: { frequency: 'weekly' as const, interval: 2, startsOn: '2026-10-12' as const, endsOn: null, weekdays: [1, 3] } };
    expect(occursOn(weekly, '2026-10-12')).toBe(true);
    expect(occursOn(weekly, '2026-10-14')).toBe(true);
    expect(occursOn(weekly, '2026-10-19')).toBe(false);
    expect(occursOn(weekly, '2026-10-26')).toBe(true);
    const monthly = { ...baseTask('2026-01-31'), recurrence: { frequency: 'monthly' as const, interval: 1, startsOn: '2026-01-31' as const, endsOn: null, weekdays: [] } };
    expect(occursOn(monthly, '2026-02-28')).toBe(false);
    expect(occursOn(monthly, '2026-03-31')).toBe(true);
  });

  it('retains the legacy subtask repository API for compatibility', async () => {
    const task = await todoRepository.saveTask(draft({ subtasks: [{ id: 'a', title: '一', checked: false }, { id: 'b', title: '二', checked: false }] }));
    await todoRepository.setSubtaskChecked(task.id, null, 'a', true);
    expect((await todoRepository.listTasks())[0].completedAt).toBeNull();
    await todoRepository.setSubtaskChecked(task.id, null, 'b', true);
    expect((await todoRepository.listTasks())[0].completionSource).toBe('subtasks');
    await todoRepository.setSubtaskChecked(task.id, null, 'a', false);
    expect((await todoRepository.listTasks())[0].completedAt).toBeNull();

    const empty = await todoRepository.saveTask(draft({ title: '空子任务' }));
    await todoRepository.setCompleted(empty.id, null, true);
    expect((await todoRepository.listTasks()).find((item) => item.id === empty.id)?.completionSource).toBe('manual');
  });

  it('preserves checked legacy subtasks and pending completion when saving unrelated task fields', async () => {
    const task = await todoRepository.saveTask(draft({ subtasks: [{ id: 'a', title: '旧步骤A', checked: false }, { id: 'b', title: '旧步骤B', checked: false }] }));
    await todoRepository.setSubtaskChecked(task.id, null, 'a', true);
    await todoRepository.setSubtaskChecked(task.id, null, 'b', true);
    await todoRepository.setCompleted(task.id, null, false);

    const legacyBeforeEdit = (await todoRepository.listTasks()).find((item) => item.id === task.id)!;
    expect(legacyBeforeEdit).toMatchObject({ completedAt: null, completionSource: null });
    const saved = await todoRepository.saveTask({ ...legacyBeforeEdit, note: '只更新备注' });

    expect(saved).toMatchObject({ note: '只更新备注', completedAt: null, completionSource: null });
    expect(saved.subtasks).toEqual(legacyBeforeEdit.subtasks);
  });

  it('isolates recurring subtask state by cycle and keeps manual completion independent', async () => {
    const task = await todoRepository.saveTask(draft({
      title: '收衣服', scheduledDate: '2026-10-12', subtasks: [{ id: 'a', title: '看天气', checked: false }],
      recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-12', endsOn: null, weekdays: [] }
    }));
    await todoRepository.setSubtaskChecked(task.id, '2026-10-13', 'a', true);
    const days = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-14');
    expect(days[0].subtasks[0].checked).toBe(true);
    expect(days[0].completionSource).toBe('subtasks');
    expect(days[1].subtasks[0].checked).toBe(false);
    await todoRepository.setCompleted(task.id, '2026-10-14', true);
    await todoRepository.setSubtaskChecked(task.id, '2026-10-14', 'a', true);
    expect(occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-14', '2026-10-14')[0].completionSource).toBe('manual');
  });

  it('deduplicates personal tags and stores one-occurrence overrides separately', async () => {
    const a = await todoRepository.upsertTag('  工作  ');
    const b = await todoRepository.upsertTag('工作');
    expect(b.id).toBe(a.id);
    const task = await todoRepository.saveTask(draft({ title: '每日记录', scheduledDate: '2026-10-14', recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-14', endsOn: null, weekdays: [] } }));
    await todoRepository.saveOccurrenceOverride(task.id, '2026-10-15', { title: '只改这一次', scheduledDate: '2026-10-16', tags: [a.id] });
    const moved = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-16', '2026-10-16');
    expect(moved.find((item) => item.periodDate === '2026-10-15')?.title).toBe('只改这一次');
    expect(moved.find((item) => item.periodDate === '2026-10-15')?.scheduledDate).toBe('2026-10-16');
    const next = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-17', '2026-10-17');
    expect(next[0].title).toBe('每日记录');
  });

  it('moves a recurring instance across dates without leaving the old copy and persists completion and edits after reload', async () => {
    const task = await todoRepository.saveTask(draft({
      title: '每周散步', scheduledDate: '2026-10-12',
      recurrence: { frequency: 'weekly', interval: 1, startsOn: '2026-10-12', endsOn: null, weekdays: [1] }
    }));

    await todoRepository.saveOccurrenceOverride(task.id, '2026-10-12', { scheduledDate: '2026-10-13' });
    expect(occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-12', '2026-10-12')).toEqual([]);

    const moved = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-13');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ periodDate: '2026-10-12', scheduledDate: '2026-10-13', title: '每周散步' });

    resetDatabaseConnectionForTests();
    const afterReload = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-13');
    expect(afterReload).toHaveLength(1);
    expect(afterReload[0].periodDate).toBe('2026-10-12');

    await todoRepository.setCompleted(task.id, '2026-10-12', true);
    await todoRepository.saveOccurrenceOverride(task.id, '2026-10-12', { title: '改期后的散步' });
    const edited = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-13');
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ periodDate: '2026-10-12', scheduledDate: '2026-10-13', title: '改期后的散步', completionSource: 'manual' });
    expect(edited[0].completedAt).toBeTypeOf('number');
  });

  it('keeps completed cycle history when the series rule changes from an effective date', async () => {
    const task = await todoRepository.saveTask(draft({
      title: '伸展', scheduledDate: '2026-10-12',
      subtasks: [{ id: 'stretch', title: '肩颈拉伸', checked: false }],
      recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-12', endsOn: null, weekdays: [] }
    }));
    await todoRepository.setCompleted(task.id, '2026-10-13', true);
    await todoRepository.saveTask({
      ...task, scheduledDate: '2026-10-15',
      recurrence: { frequency: 'weekly', interval: 1, startsOn: '2026-10-15', endsOn: null, weekdays: [4] }
    }, '2026-10-15');
    const persisted = (await todoRepository.listTasks())[0];
    expect(persisted.recurrenceHistory).toEqual([{ ...task.recurrence!, endsOn: '2026-10-14' }]);
    const beforeEdit = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-12', '2026-10-14');
    expect(beforeEdit.map((item) => item.periodDate)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(beforeEdit[1].completedAt).toBeTypeOf('number');
    expect(occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-15', '2026-10-15')).toHaveLength(1);

    await todoRepository.setCompleted(task.id, '2026-10-13', false);
    await todoRepository.setSubtaskChecked(task.id, '2026-10-13', 'stretch', true);
    await todoRepository.saveOccurrenceOverride(task.id, '2026-10-13', { title: '规则变更后仍可编辑的历史周期' });
    const editedHistory = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-13');
    expect(editedHistory[0]).toMatchObject({ title: '规则变更后仍可编辑的历史周期', completionSource: 'subtasks' });
    expect(editedHistory[0].completedAt).toBeTypeOf('number');
    const changedMaster = (await todoRepository.listTasks())[0];
    expect(changedMaster.completedAt).toBeNull();
    expect(changedMaster.subtasks[0]?.checked).toBe(false);
  });

  it('keeps the selected task as a one-off when a repeat series is stopped', async () => {
    const task = await todoRepository.saveTask(draft({
      title: '伸展', scheduledDate: '2026-10-12',
      recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-12', endsOn: null, weekdays: [] }
    }));
    await todoRepository.setCompleted(task.id, '2026-10-13', true);
    await todoRepository.saveTask({ ...task, scheduledDate: '2026-10-14', recurrence: null }, '2026-10-14');

    const instances = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-14');
    expect(instances).toHaveLength(2);
    expect(instances.find((item) => item.periodDate === '2026-10-13')?.completedAt).toBeTypeOf('number');
    const stopped = instances.find((item) => item.periodDate === null);
    expect(stopped?.scheduledDate).toBe('2026-10-14');
    expect(stopped?.completedAt).toBeNull();

    await todoRepository.setCompleted(task.id, null, true);
    const afterCompletion = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-14');
    expect(afterCompletion.find((item) => item.periodDate === '2026-10-13')?.completedAt).toBeTypeOf('number');
    expect(afterCompletion.find((item) => item.periodDate === null)?.completedAt).toBeTypeOf('number');
  });

  it('keeps historical completion, restoration, subtask changes, and edits separate after stopping a series', async () => {
    const task = await todoRepository.saveTask(draft({
      title: '整理花园', scheduledDate: '2026-10-12',
      subtasks: [{ id: 'water', title: '浇水', checked: false }],
      recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-12', endsOn: null, weekdays: [] }
    }));
    await todoRepository.saveTask({ ...task, scheduledDate: '2026-10-14', recurrence: null }, '2026-10-14');

    await todoRepository.setCompleted(task.id, '2026-10-13', true);
    expect((await todoRepository.listTasks())[0].completedAt).toBeNull();
    await todoRepository.setCompleted(task.id, '2026-10-13', false);
    await todoRepository.setSubtaskChecked(task.id, '2026-10-13', 'water', true);
    await todoRepository.saveOccurrenceOverride(task.id, '2026-10-13', { title: '已停止系列中的历史编辑' });

    const historical = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-13');
    expect(historical).toHaveLength(1);
    expect(historical[0]).toMatchObject({ title: '已停止系列中的历史编辑', completionSource: 'subtasks', subtasks: [{ id: 'water', checked: true }] });
    expect(historical[0].completedAt).toBeTypeOf('number');

    await todoRepository.setSubtaskChecked(task.id, '2026-10-13', 'water', false);
    const restoredHistory = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-13', '2026-10-13')[0];
    expect(restoredHistory.completedAt).toBeNull();
    expect(restoredHistory.subtasks[0].checked).toBe(false);

    const oneOff = occurrencesInRange(await todoRepository.listTasks(), await todoRepository.listOccurrences(), '2026-10-14', '2026-10-14').find((item) => item.periodDate === null);
    const stoppedMaster = (await todoRepository.listTasks())[0];
    expect(oneOff?.completedAt).toBeNull();
    expect(stoppedMaster.completedAt).toBeNull();
    expect(stoppedMaster.subtasks[0].checked).toBe(false);
  });

  it('persists editable reminder metadata, skips missed reminders, and schedules only future cycles', async () => {
    const due = new Date(Date.now() + 90 * 60_000);
    due.setSeconds(0, 0);
    const date = toDateKey(due);
    const time = String(due.getHours()).padStart(2, '0') + ':' + String(due.getMinutes()).padStart(2, '0');
    const task = await todoRepository.saveTask(draft({ scheduledDate: date, scheduledTime: time, reminder: { enabled: true, minutesBefore: 10 } }));
    expect((await todoRepository.listTasks())[0].reminder).toEqual({ enabled: true, minutesBefore: 10 });
    const instance = occurrencesInRange(await todoRepository.listTasks(), [], date, date)[0];
    const reminder = reminderSchedule(instance, Date.now());
    expect(reminder?.firesAt).toBe(due.getTime() - 10 * 60_000);
    expect(reminderSchedule({ ...instance, completedAt: Date.now() }, Date.now())).toBeNull();
    expect(reminderSchedule({ ...instance, reminder: { enabled: false, minutesBefore: 10 } }, Date.now())).toBeNull();
    expect(reminderSchedule({ ...instance, reminder: { enabled: true, minutesBefore: 30 } }, Date.now())?.key).not.toBe(reminder?.key);
    expect(reminderSchedule({ ...instance, scheduledDate: '2020-01-01', scheduledTime: '00:00' }, Date.now())).toBeNull();
    const changed = await todoRepository.saveTask({ ...task, reminder: { enabled: false, minutesBefore: 10 } });
    expect(changed.reminder.enabled).toBe(false);
  });

  it('deletes a series and all cycle records as a single explicit repository operation', async () => {
    const task = await todoRepository.saveTask(draft({ scheduledDate: '2026-10-14', recurrence: { frequency: 'daily', interval: 1, startsOn: '2026-10-14', endsOn: null, weekdays: [] } }));
    await todoRepository.setCompleted(task.id, '2026-10-14', true);
    await todoRepository.deleteTask(task.id);
    expect(await todoRepository.listTasks()).toEqual([]);
    expect(await todoRepository.listOccurrences()).toEqual([]);
  });
});

describe('local calendar dates', () => {
  it('uses local date keys and handles week/year/month boundaries', () => {
    expect(toDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
    expect(monthGridKeys('2026-02-01')).toHaveLength(35);
  });
});

function baseTask(date: '2026-10-12' | '2026-01-31'): PersonalTask {
  return { id: 'repeat', title: '任务', note: '', scheduledDate: date, scheduledTime: null, tags: [], subtasks: [], createdAt: 0, updatedAt: 0, completedAt: null, completionSource: null, recurrence: null, recurrenceHistory: [], seriesId: null, reminder: { enabled: false, minutesBefore: 10 } };
}
