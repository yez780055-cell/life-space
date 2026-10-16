import { addDays, fromDateKey, startOfWeek, toDateKey } from './dates';
import type { DateKey, PersonalTask, RecurrenceRule, TaskInstance, TaskOccurrence } from './model';
import { occurrenceKey } from './model';

function monthDistance(a: DateKey, b: DateKey) {
  const left = fromDateKey(a), right = fromDateKey(b);
  return (right.getFullYear() - left.getFullYear()) * 12 + right.getMonth() - left.getMonth();
}

function calendarDayDistance(a: DateKey, b: DateKey) {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

function isDateKey(key: DateKey) {
  return !Number.isNaN(fromDateKey(key).getTime());
}

export function occursOn(task: PersonalTask, date: DateKey): boolean {
  const rule = task.recurrence;
  if (!rule || date < rule.startsOn || (rule.endsOn && date > rule.endsOn)) return false;
  const candidate = fromDateKey(date), start = fromDateKey(rule.startsOn);
  if (rule.frequency === 'daily') {
    const days = calendarDayDistance(rule.startsOn, date);
    return days >= 0 && days % rule.interval === 0;
  }
  if (rule.frequency === 'weekly') {
    const weeks = calendarDayDistance(startOfWeek(rule.startsOn), startOfWeek(date)) / 7;
    return weeks >= 0 && weeks % rule.interval === 0 && rule.weekdays.includes(candidate.getDay());
  }
  const months = monthDistance(rule.startsOn, date);
  // Monthly dates that do not exist (for example the 31st in April) are skipped.
  return months >= 0 && months % rule.interval === 0 && candidate.getDate() === start.getDate();
}

/** Return the first valid cycle on or after a date without scanning every day. */
export function nextOccurrenceDate(rule: RecurrenceRule, from: DateKey): DateKey | null {
  if (!Number.isSafeInteger(rule.interval) || rule.interval < 1) return null;
  const first = from < rule.startsOn ? rule.startsOn : from;
  if (rule.endsOn && first > rule.endsOn) return null;

  if (rule.frequency === 'daily') {
    const days = calendarDayDistance(rule.startsOn, first);
    const steps = Math.ceil(Math.max(0, days) / rule.interval);
    const candidate = addDays(rule.startsOn, steps * rule.interval);
    return isDateKey(candidate) && candidate >= first && (!rule.endsOn || candidate <= rule.endsOn) ? candidate : null;
  }

  if (rule.frequency === 'weekly') {
    const weekdays = [...new Set(rule.weekdays)].filter((day) => day >= 0 && day <= 6).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (weekdays.length === 0) return null;
    const firstWeek = startOfWeek(rule.startsOn);
    const candidateWeek = startOfWeek(first);
    const weeksFromStart = Math.floor(calendarDayDistance(firstWeek, candidateWeek) / 7);
    let intervalWeek = Math.ceil(Math.max(0, weeksFromStart) / rule.interval) * rule.interval;

    while (Number.isSafeInteger(intervalWeek)) {
      const weekStart = addDays(firstWeek, intervalWeek * 7);
      if (!isDateKey(weekStart) || (rule.endsOn && weekStart > rule.endsOn)) return null;
      for (const weekday of weekdays) {
        // Convert JavaScript's Sunday-first weekday to a Monday-first offset.
        const candidate = addDays(weekStart, (weekday + 6) % 7);
        if (isDateKey(candidate) && candidate >= first && candidate >= rule.startsOn && (!rule.endsOn || candidate <= rule.endsOn)) return candidate;
      }
      intervalWeek += rule.interval;
    }
    return null;
  }

  const start = fromDateKey(rule.startsOn);
  const monthOffset = monthDistance(rule.startsOn, first);
  let intervalMonth = Math.ceil(Math.max(0, monthOffset) / rule.interval) * rule.interval;
  while (Number.isSafeInteger(intervalMonth)) {
    const absoluteMonth = start.getFullYear() * 12 + start.getMonth() + intervalMonth;
    const year = Math.floor(absoluteMonth / 12);
    const month = absoluteMonth % 12;
    const monthStart = new Date(year, month, 1);
    if (Number.isNaN(monthStart.getTime())) return null;
    const day = start.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();
    if (day <= lastDay) {
      const candidate = toDateKey(new Date(year, month, day));
      if (isDateKey(candidate) && candidate >= first && (!rule.endsOn || candidate <= rule.endsOn)) return candidate;
    }
    intervalMonth += rule.interval;
  }
  return null;
}

function makeInstance(task: PersonalTask, periodDate: DateKey | null, occurrence?: TaskOccurrence): TaskInstance {
  const override = occurrence?.override ?? {};
  const subtaskTemplate = override.subtasks ?? task.subtasks;
  const subtasks = subtaskTemplate.map((subtask) => ({ ...subtask, checked: occurrence?.subtaskChecks[subtask.id] ?? subtask.checked }));
  return {
    instanceKey: periodDate ? occurrenceKey(task.id, periodDate) : task.id,
    taskId: task.id,
    periodDate,
    title: override.title ?? task.title,
    note: override.note ?? task.note,
    scheduledDate: override.scheduledDate ?? occurrence?.scheduledDate ?? periodDate ?? task.scheduledDate,
    scheduledTime: override.scheduledTime ?? task.scheduledTime,
    tags: override.tags ?? task.tags,
    subtasks,
    completedAt: occurrence ? occurrence.completedAt : (periodDate === null || task.seriesId === null ? task.completedAt : null),
    completionSource: occurrence ? occurrence.completionSource : (periodDate === null || task.seriesId === null ? task.completionSource : null),
    recurrence: task.recurrence,
    reminder: override.reminder ?? task.reminder,
    createdAt: task.createdAt,
    updatedAt: occurrence?.updatedAt ?? task.updatedAt
  };
}

export function occurrencesInRange(tasks: PersonalTask[], occurrences: TaskOccurrence[], from: DateKey, through: DateKey): TaskInstance[] {
  const occurrenceMap = new Map(occurrences.map((occurrence) => [occurrence.key, occurrence]));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const instances = new Map<string, TaskInstance>();
  for (const task of tasks) {
    const ruleVersions = [...task.recurrenceHistory, ...(task.recurrence ? [task.recurrence] : [])];
    if (ruleVersions.length === 0) {
      if (task.scheduledDate && task.scheduledDate >= from && task.scheduledDate <= through) {
        const instance = makeInstance(task, null);
        instances.set(instance.instanceKey, instance);
      }
      continue;
    }
    for (const rule of ruleVersions) {
      const ruleTask = { ...task, recurrence: rule };
      let cursor = rule.startsOn < from ? from : rule.startsOn;
      while (cursor <= through) {
        if (occursOn(ruleTask, cursor)) {
          const occurrence = occurrenceMap.get(occurrenceKey(task.id, cursor));
          if (!occurrence?.skipped) {
            const instance = makeInstance(task, cursor, occurrence);
            if (instance.scheduledDate && instance.scheduledDate >= from && instance.scheduledDate <= through) instances.set(instance.instanceKey, instance);
          }
        }
        cursor = addDays(cursor, 1);
      }
    }
    // A stopped series keeps its current master as a one-off while the clipped
    // rule history continues to render its earlier cycles.
    if (!task.recurrence && task.recurrenceHistory.length > 0 && task.scheduledDate && task.scheduledDate >= from && task.scheduledDate <= through) {
      const instance = makeInstance(task, null);
      instances.set(instance.instanceKey, instance);
    }
  }
  // One-occurrence reschedules may move a generated cycle into or out of this interval.
  for (const occurrence of occurrences) {
    if (occurrence.skipped || !occurrence.override.scheduledDate || occurrence.override.scheduledDate < from || occurrence.override.scheduledDate > through) continue;
    const task = byId.get(occurrence.taskId);
    if (!task || task.seriesId === null) continue;
    const instance = makeInstance(task, occurrence.periodDate, occurrence);
    instances.set(instance.instanceKey, instance);
  }
  return [...instances.values()].sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '') || a.createdAt - b.createdAt);
}

/**
 * Build a finite all-tasks view. One-off records and explicitly stored cycles
 * are shown as-is. An unrecorded recurring series contributes only its next
 * upcoming cycle, so an open-ended rule cannot expand without bound.
 */
export function allInstances(tasks: PersonalTask[], occurrences: TaskOccurrence[], from: DateKey): TaskInstance[] {
  const occurrenceMap = new Map(occurrences.map((occurrence) => [occurrence.key, occurrence]));
  const occurrencesByTask = new Map<string, TaskOccurrence[]>();
  for (const occurrence of occurrences) {
    occurrencesByTask.set(occurrence.taskId, [...(occurrencesByTask.get(occurrence.taskId) ?? []), occurrence]);
  }

  const instances = new Map<string, TaskInstance>();
  for (const task of tasks) {
    const rules = [...task.recurrenceHistory, ...(task.recurrence ? [task.recurrence] : [])];
    if (!task.recurrence) instances.set(task.id, makeInstance(task, null));

    if (task.seriesId === null || rules.length === 0) continue;
    for (const occurrence of occurrencesByTask.get(task.id) ?? []) {
      if (occurrence.skipped || !rules.some((rule) => occursOn({ ...task, recurrence: rule }, occurrence.periodDate))) continue;
      instances.set(occurrence.key, makeInstance(task, occurrence.periodDate, occurrence));
    }

    if (!task.recurrence) continue;
    let candidate = nextOccurrenceDate(task.recurrence, from);
    while (candidate && occurrenceMap.has(occurrenceKey(task.id, candidate))) {
      candidate = nextOccurrenceDate(task.recurrence, addDays(candidate, 1));
    }
    if (candidate) instances.set(occurrenceKey(task.id, candidate), makeInstance(task, candidate));
  }

  return [...instances.values()].sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') || a.createdAt - b.createdAt);
}

export function recurrenceDates(task: PersonalTask, from: DateKey, through: DateKey): DateKey[] {
  if (!task.recurrence) return [];
  const result: DateKey[] = [];
  let cursor = task.recurrence.startsOn < from ? from : task.recurrence.startsOn;
  while (cursor <= through) {
    if (occursOn(task, cursor)) result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}
