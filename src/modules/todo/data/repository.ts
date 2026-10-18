import { openDatabase } from '../../../shared/storage/database';
import { addDays } from './dates';
import type { DateKey } from './model';
import { occurrenceKey, validateTaskDraft, type PersonalTag, type PersonalTask, type TaskDraft, type TaskOccurrence, type TaskOverride } from './model';
import { occursOn } from './recurrence';

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function transaction(stores: string[], mode: IDBTransactionMode, apply: (tx: IDBTransaction, fail: (error: Error) => void) => void): Promise<void> {
  return openDatabase().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let failure: Error | undefined;
    const fail = (error: Error) => { failure = error; try { tx.abort(); } catch { reject(error); } };
    tx.oncomplete = () => failure ? reject(failure) : resolve();
    tx.onerror = () => reject(failure ?? tx.error ?? new Error('本地待办数据写入失败'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('本地待办数据写入中断'));
    try { apply(tx, fail); } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  }));
}

function readAll<T>(storeName: string): Promise<T[]> {
  return openDatabase().then((db) => new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('读取本地待办数据失败'));
  }));
}

function emptyOccurrence(taskId: string, periodDate: DateKey): TaskOccurrence {
  return { key: occurrenceKey(taskId, periodDate), taskId, periodDate, scheduledDate: periodDate, completedAt: null, completionSource: null, override: {}, skipped: false, updatedAt: Date.now() };
}

function normalizeOccurrence(occurrence: TaskOccurrence | undefined, taskId: string, periodDate: DateKey): TaskOccurrence {
  const current = occurrence ?? emptyOccurrence(taskId, periodDate);
  const source = current.override ?? {};
  const override: TaskOverride = {};
  if (source.title !== undefined) override.title = source.title;
  if (source.note !== undefined) override.note = source.note;
  if (source.scheduledDate !== undefined) override.scheduledDate = source.scheduledDate;
  if (source.scheduledTime !== undefined) override.scheduledTime = source.scheduledTime;
  if (source.tags !== undefined) override.tags = [...source.tags];
  if (source.reminder !== undefined) override.reminder = { ...source.reminder };
  return {
    key: occurrenceKey(taskId, periodDate), taskId, periodDate,
    scheduledDate: current.scheduledDate ?? periodDate,
    completedAt: current.completedAt ?? null,
    completionSource: current.completionSource === 'manual' ? 'manual' : null,
    override, skipped: Boolean(current.skipped), updatedAt: current.updatedAt ?? Date.now()
  };
}

function normalizeTask(task: PersonalTask): PersonalTask {
  return {
    id: task.id, title: task.title, note: task.note,
    scheduledDate: task.scheduledDate, scheduledTime: task.scheduledTime,
    tags: [...task.tags], createdAt: task.createdAt, updatedAt: task.updatedAt,
    completedAt: task.completedAt ?? null,
    completionSource: task.completionSource === 'manual' ? 'manual' : null,
    recurrence: task.recurrence ? { ...task.recurrence, weekdays: [...task.recurrence.weekdays] } : null,
    recurrenceHistory: (task.recurrenceHistory ?? []).map((rule) => ({ ...rule, weekdays: [...rule.weekdays] })),
    seriesId: task.seriesId ?? null,
    reminder: { ...task.reminder }
  };
}

function isRecurringPeriod(task: PersonalTask, periodDate: DateKey): boolean {
  const rules = [...task.recurrenceHistory, ...(task.recurrence ? [task.recurrence] : [])];
  return task.seriesId !== null && rules.some((rule) => occursOn({ ...task, recurrence: rule }, periodDate));
}

export const todoRepository = {
  listTasks: () => readAll<PersonalTask>('todoTasks'),
  listTags: () => readAll<PersonalTag>('todoTags'),
  listOccurrences: () => readAll<TaskOccurrence>('todoOccurrences'),

  async saveTask(draft: TaskDraft, effectiveFrom?: DateKey): Promise<PersonalTask> {
    const error = validateTaskDraft(draft);
    if (error) throw new Error(error);
    const now = Date.now();
    let saved: PersonalTask | undefined;
    await transaction(['todoTasks'], 'readwrite', (tx, fail) => {
      const store = tx.objectStore('todoTasks');
      const existingRequest = draft.id ? store.get(draft.id) : undefined;
      const save = (existing?: PersonalTask) => {
        const id = draft.id ?? newId();
        const recurrenceHistory = [...(existing?.recurrenceHistory ?? draft.recurrenceHistory ?? [])];
        let recurrence = draft.recurrence;
        if (existing?.recurrence && effectiveFrom && JSON.stringify(existing.recurrence) !== JSON.stringify(draft.recurrence)) {
          const clippedEnd = addDays(effectiveFrom, -1);
          if (existing.recurrence.startsOn <= clippedEnd && (!existing.recurrence.endsOn || existing.recurrence.endsOn >= existing.recurrence.startsOn)) {
            const oldEnd = existing.recurrence.endsOn && existing.recurrence.endsOn < clippedEnd ? existing.recurrence.endsOn : clippedEnd;
            if (existing.recurrence.startsOn <= oldEnd) recurrenceHistory.push({ ...existing.recurrence, endsOn: oldEnd });
          }
          recurrence = draft.recurrence ? { ...draft.recurrence, startsOn: draft.recurrence.startsOn < effectiveFrom ? effectiveFrom : draft.recurrence.startsOn } : null;
        }
        saved = {
          id,
          title: draft.title.trim(),
          note: draft.note.trim(),
          scheduledDate: draft.scheduledDate,
          scheduledTime: draft.scheduledTime,
          tags: [...new Set(draft.tags)],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          completedAt: existing?.completedAt ?? null,
          completionSource: existing?.completionSource === 'manual' ? 'manual' : null,
          recurrence,
          recurrenceHistory,
          seriesId: recurrence || recurrenceHistory.length > 0 ? (existing?.seriesId ?? id) : null,
          reminder: { enabled: draft.reminder.enabled, minutesBefore: Math.max(0, Math.min(1440, draft.reminder.minutesBefore)) }
        };
        store.put(saved);
      };
      if (!existingRequest) save();
      else {
        existingRequest.onsuccess = () => save(existingRequest.result as PersonalTask | undefined);
        existingRequest.onerror = () => fail(existingRequest.error ?? new Error('读取任务失败'));
      }
    });
    if (!saved) throw new Error('任务没有保存成功，请重试。');
    return saved;
  },

  async createQuickTask(title: string, scheduledDate: DateKey | null = null): Promise<PersonalTask> {
    return this.saveTask({ title, note: '', scheduledDate, scheduledTime: null, tags: [], recurrence: null, recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 } });
  },

  async deleteTask(taskId: string): Promise<void> {
    await transaction(['todoTasks', 'todoOccurrences'], 'readwrite', (tx, fail) => {
      tx.objectStore('todoTasks').delete(taskId);
      const request = tx.objectStore('todoOccurrences').index('taskId').openKeyCursor(IDBKeyRange.only(taskId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        tx.objectStore('todoOccurrences').delete(cursor.primaryKey);
        cursor.continue();
      };
      request.onerror = () => fail(request.error ?? new Error('删除任务周期记录失败'));
    });
  },

  async setCompleted(taskId: string, periodDate: DateKey | null, completed: boolean): Promise<void> {
    const stores = periodDate ? ['todoTasks', 'todoOccurrences'] : ['todoTasks'];
    await transaction(stores, 'readwrite', (tx, fail) => {
      const taskStore = tx.objectStore('todoTasks');
      const request = taskStore.get(taskId);
      request.onsuccess = () => {
        const task = request.result as PersonalTask | undefined;
        if (!task) return fail(new Error('找不到这项任务，请刷新后重试。'));
        const now = Date.now();
        if (periodDate) {
          if (!isRecurringPeriod(task, periodDate)) return fail(new Error('找不到这项重复任务周期，请刷新后重试。'));
          const store = tx.objectStore('todoOccurrences');
          const occurrenceRequest = store.get(occurrenceKey(taskId, periodDate));
          occurrenceRequest.onsuccess = () => {
            const occurrence = normalizeOccurrence(occurrenceRequest.result as TaskOccurrence | undefined, taskId, periodDate);
            occurrence.completedAt = completed ? now : null;
            occurrence.completionSource = completed ? 'manual' : null;
            occurrence.updatedAt = now;
            store.put(occurrence);
          };
          occurrenceRequest.onerror = () => fail(occurrenceRequest.error ?? new Error('读取任务周期失败'));
        } else {
          taskStore.put({ ...normalizeTask(task), completedAt: completed ? now : null, completionSource: completed ? 'manual' : null, updatedAt: now });
        }
      };
      request.onerror = () => fail(request.error ?? new Error('读取任务失败'));
    });
  },

  async saveOccurrenceOverride(taskId: string, periodDate: DateKey, override: TaskOverride): Promise<void> {
    await transaction(['todoOccurrences'], 'readwrite', (tx, fail) => {
      const store = tx.objectStore('todoOccurrences');
      const request = store.get(occurrenceKey(taskId, periodDate));
      request.onsuccess = () => {
        const occurrence = normalizeOccurrence(request.result as TaskOccurrence | undefined, taskId, periodDate);
        occurrence.override = {
          ...occurrence.override,
          ...(override.title !== undefined ? { title: override.title } : {}),
          ...(override.note !== undefined ? { note: override.note } : {}),
          ...(override.scheduledDate !== undefined ? { scheduledDate: override.scheduledDate } : {}),
          ...(override.scheduledTime !== undefined ? { scheduledTime: override.scheduledTime } : {}),
          ...(override.tags !== undefined ? { tags: [...override.tags] } : {}),
          ...(override.reminder !== undefined ? { reminder: { ...override.reminder } } : {})
        };
        occurrence.scheduledDate = override.scheduledDate ?? occurrence.scheduledDate;
        occurrence.skipped = false;
        occurrence.updatedAt = Date.now();
        store.put(occurrence);
      };
      request.onerror = () => fail(request.error ?? new Error('读取任务周期失败'));
    });
  },

  async skipOccurrence(taskId: string, periodDate: DateKey): Promise<void> {
    await transaction(['todoOccurrences'], 'readwrite', (tx, fail) => {
      const store = tx.objectStore('todoOccurrences');
      const request = store.get(occurrenceKey(taskId, periodDate));
      request.onsuccess = () => {
        const occurrence = normalizeOccurrence(request.result as TaskOccurrence | undefined, taskId, periodDate);
        occurrence.skipped = true;
        occurrence.updatedAt = Date.now();
        store.put(occurrence);
      };
      request.onerror = () => fail(request.error ?? new Error('读取任务周期失败'));
    });
  },

  async upsertTag(name: string): Promise<PersonalTag> {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (!normalized) throw new Error('标签名称不能为空。');
    let saved: PersonalTag | undefined;
    await transaction(['todoTags'], 'readwrite', (tx, fail) => {
      const store = tx.objectStore('todoTags');
      const normalizedName = normalized.toLocaleLowerCase();
      const request = store.index('normalizedName').get(normalizedName);
      request.onsuccess = () => {
        const existing = request.result as PersonalTag | undefined;
        if (existing) { saved = existing; return; }
        saved = { id: newId(), name: normalized, normalizedName, color: null, createdAt: Date.now() };
        store.add(saved);
      };
      request.onerror = () => fail(request.error ?? new Error('读取标签失败'));
    });
    if (!saved) throw new Error('标签没有保存成功，请重试。');
    return saved;
  }
};
