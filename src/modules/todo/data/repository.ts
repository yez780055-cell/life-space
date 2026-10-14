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
  return { key: occurrenceKey(taskId, periodDate), taskId, periodDate, scheduledDate: periodDate, completedAt: null, completionSource: null, subtaskChecks: {}, override: {}, skipped: false, updatedAt: Date.now() };
}

function syncSubtaskCompletion(subtasks: PersonalTask['subtasks'], completedAt: number | null, source: PersonalTask['completionSource']) {
  const allChecked = subtasks.length > 0 && subtasks.every((subtask) => subtask.checked);
  if (allChecked && !completedAt) return { completedAt: Date.now(), completionSource: 'subtasks' as const };
  if (!allChecked && source === 'subtasks') return { completedAt: null, completionSource: null };
  return { completedAt, completionSource: source };
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
          ...existing,
          ...draft,
          id,
          title: draft.title.trim(),
          note: draft.note.trim(),
          tags: [...new Set(draft.tags)],
          subtasks: draft.subtasks.filter((item) => item.title.trim()).map((item) => ({ ...item, title: item.title.trim() })),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          completedAt: existing?.completedAt ?? null,
          completionSource: existing?.completionSource ?? null,
          recurrence,
          recurrenceHistory,
          seriesId: recurrence || recurrenceHistory.length > 0 ? (existing?.seriesId ?? id) : null,
          reminder: { enabled: draft.reminder.enabled, minutesBefore: Math.max(0, Math.min(1440, draft.reminder.minutesBefore)) }
        };
        if (!saved.recurrence) {
          const completion = syncSubtaskCompletion(saved.subtasks, saved.completedAt, saved.completionSource);
          saved.completedAt = completion.completedAt;
          saved.completionSource = completion.completionSource;
        }
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
    return this.saveTask({ title, note: '', scheduledDate, scheduledTime: null, tags: [], subtasks: [], recurrence: null, recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 } });
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
            const occurrence = (occurrenceRequest.result as TaskOccurrence | undefined) ?? emptyOccurrence(taskId, periodDate);
            occurrence.override.subtasks ??= task.subtasks.map((subtask) => ({ ...subtask }));
            occurrence.completedAt = completed ? now : null;
            occurrence.completionSource = completed ? 'manual' : null;
            occurrence.updatedAt = now;
            store.put(occurrence);
          };
          occurrenceRequest.onerror = () => fail(occurrenceRequest.error ?? new Error('读取任务周期失败'));
        } else {
          task.completedAt = completed ? now : null;
          task.completionSource = completed ? 'manual' : null;
          task.updatedAt = now;
          taskStore.put(task);
        }
      };
      request.onerror = () => fail(request.error ?? new Error('读取任务失败'));
    });
  },

  async setSubtaskChecked(taskId: string, periodDate: DateKey | null, subtaskId: string, checked: boolean): Promise<void> {
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
            const occurrence = (occurrenceRequest.result as TaskOccurrence | undefined) ?? emptyOccurrence(taskId, periodDate);
            occurrence.override.subtasks ??= task.subtasks.map((subtask) => ({ ...subtask }));
            occurrence.subtaskChecks[subtaskId] = checked;
            const current = (occurrence.override.subtasks ?? task.subtasks).map((subtask) => ({ ...subtask, checked: occurrence.subtaskChecks[subtask.id] ?? subtask.checked }));
            const completion = syncSubtaskCompletion(current, occurrence.completedAt, occurrence.completionSource);
            occurrence.completedAt = completion.completedAt;
            occurrence.completionSource = completion.completionSource;
            occurrence.updatedAt = now;
            store.put(occurrence);
          };
          occurrenceRequest.onerror = () => fail(occurrenceRequest.error ?? new Error('读取任务周期失败'));
        } else {
          task.subtasks = task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, checked } : subtask);
          const completion = syncSubtaskCompletion(task.subtasks, task.completedAt, task.completionSource);
          task.completedAt = completion.completedAt;
          task.completionSource = completion.completionSource;
          task.updatedAt = now;
          taskStore.put(task);
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
        const occurrence = (request.result as TaskOccurrence | undefined) ?? emptyOccurrence(taskId, periodDate);
        occurrence.override = { ...occurrence.override, ...override };
        occurrence.scheduledDate = override.scheduledDate ?? occurrence.scheduledDate;
        if (override.subtasks) {
          occurrence.subtaskChecks = Object.fromEntries(override.subtasks.map((subtask) => [subtask.id, subtask.checked]));
          const completion = syncSubtaskCompletion(override.subtasks, occurrence.completedAt, occurrence.completionSource);
          occurrence.completedAt = completion.completedAt;
          occurrence.completionSource = completion.completionSource;
        }
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
        const occurrence = (request.result as TaskOccurrence | undefined) ?? emptyOccurrence(taskId, periodDate);
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
