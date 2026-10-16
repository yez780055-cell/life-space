import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, PeriodRecord } from '../types';
import { defaultSettings } from '../domain/storage';
import { clearPeriodData, loadPeriodSnapshot, mutatePeriodRecords, replacePeriodData, updatePeriodSettings } from './repository';
import { DB_NAME, openDatabase, readValue, resetDatabaseConnectionForTests } from '../../../shared/storage/database';

async function deleteDb() {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
async function createV4WithData() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('settings');
      db.createObjectStore('modules');
      db.createObjectStore('todoTasks', { keyPath: 'id' });
      db.createObjectStore('todoTags', { keyPath: 'id' });
      db.createObjectStore('todoOccurrences', { keyPath: 'key' });
      db.createObjectStore('coupleItems', { keyPath: 'id' });
      db.createObjectStore('coupleTags', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['settings', 'modules', 'todoTasks', 'coupleItems'], 'readwrite');
      tx.objectStore('settings').put({ unchanged: true }, 'global');
      tx.objectStore('modules').put({ unchanged: true }, 'period:legacy');
      tx.objectStore('todoTasks').put({ id: 'todo-kept', title: 'synthetic todo' });
      tx.objectStore('coupleItems').put({ id: 'couple-kept', title: 'synthetic couple item' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}
function period(id: string, startDate: string, endDate: string | null): PeriodRecord {
  const time = '2026-01-01T00:00:00.000Z';
  return { id, startDate, endDate, createdAt: time, updatedAt: time };
}
function backup(periods: PeriodRecord[] = []): AppData {
  return { periods, settings: { ...defaultSettings(), referenceCycleLength: 29 } };
}

beforeEach(deleteDb);

describe('isolated Period repository', () => {
  it('upgrades v4 by adding only Period stores and preserves all existing data', async () => {
    await createV4WithData();
    const db = await openDatabase();
    expect(db.version).toBe(5);
    expect(['settings', 'modules', 'todoTasks', 'todoTags', 'todoOccurrences', 'coupleItems', 'coupleTags', 'periodRecords', 'periodSettings'].every((name) => db.objectStoreNames.contains(name))).toBe(true);
    db.close();
    resetDatabaseConnectionForTests();
    expect(await readValue('settings', 'global')).toEqual({ unchanged: true });
    expect(await readValue('modules', 'period:legacy')).toEqual({ unchanged: true });
    const snapshot = await loadPeriodSnapshot();
    expect(snapshot.periods).toEqual([]);
    expect(snapshot.settings.referenceCycleLength).toBeNull();
    expect(await readObject('todoTasks', 'todo-kept')).toEqual({ id: 'todo-kept', title: 'synthetic todo' });
    expect(await readObject('coupleItems', 'couple-kept')).toEqual({ id: 'couple-kept', title: 'synthetic couple item' });
  });

  it('serializes concurrent writes and persists after reopening the database', async () => {
    await loadPeriodSnapshot();
    await Promise.all(['first', 'second'].map((id, index) => mutatePeriodRecords((current) => ({
      periods: [...current, period(id, index === 0 ? '2026-01-01' : '2026-02-01', index === 0 ? '2026-01-03' : '2026-02-03')],
      value: undefined
    }))));
    expect((await loadPeriodSnapshot()).periods.map((item) => item.id).sort()).toEqual(['first', 'second']);
    resetDatabaseConnectionForTests();
    expect((await loadPeriodSnapshot()).periods).toHaveLength(2);
  });

  it('replaces Period records atomically, is repeatable, and leaves other modules untouched', async () => {
    await createV4WithData();
    await loadPeriodSnapshot();
    const imported = backup([period('imported-a', '2026-01-01', '2026-01-05')]);
    await replacePeriodData(imported, false);
    await replacePeriodData(imported, true);
    expect((await loadPeriodSnapshot()).periods).toHaveLength(1);
    expect((await loadPeriodSnapshot()).periods[0].id).toBe('imported-a');
    expect((await loadPeriodSnapshot()).settings.referenceCycleLength).toBe(29);
    expect(await readValue('settings', 'global')).toEqual({ unchanged: true });
    expect(await readValue('modules', 'period:legacy')).toEqual({ unchanged: true });
    expect(await readObject('todoTasks', 'todo-kept')).toEqual({ id: 'todo-kept', title: 'synthetic todo' });
    expect(await readObject('coupleItems', 'couple-kept')).toEqual({ id: 'couple-kept', title: 'synthetic couple item' });
  });

  it('requires authorization when Period data exists and rolls back invalid writes', async () => {
    await loadPeriodSnapshot();
    await mutatePeriodRecords((current) => ({ periods: [...current, period('existing', '2026-01-01', '2026-01-04')], value: undefined }));
    await expect(replacePeriodData(backup([period('new', '2026-02-01', '2026-02-05')]), false)).rejects.toThrow('确认替换');
    expect((await loadPeriodSnapshot()).periods.map((item) => item.id)).toEqual(['existing']);
    const invalid = backup([{ ...period('bad', '2026-02-01', '2026-02-04'), id: undefined as unknown as string }]);
    await expect(replacePeriodData(invalid, true)).rejects.toThrow();
    expect((await loadPeriodSnapshot()).periods.map((item) => item.id)).toEqual(['existing']);
  });

  it('clears only Period records/settings, not global, Todo, or Couple data', async () => {
    await createV4WithData();
    await loadPeriodSnapshot();
    await replacePeriodData(backup([period('period-only', '2026-01-01', '2026-01-04')]), false);
    await updatePeriodSettings({ careMemo: 'synthetic private memo' });
    await clearPeriodData();
    expect((await loadPeriodSnapshot()).periods).toEqual([]);
    expect((await loadPeriodSnapshot()).settings.careMemo).toBe('');
    expect(await readValue('settings', 'global')).toEqual({ unchanged: true });
    expect(await readValue('modules', 'period:legacy')).toEqual({ unchanged: true });
    expect(await readObject('todoTasks', 'todo-kept')).toEqual({ id: 'todo-kept', title: 'synthetic todo' });
    expect(await readObject('coupleItems', 'couple-kept')).toEqual({ id: 'couple-kept', title: 'synthetic couple item' });
  });
});

async function readObject(storeName: string, key: string): Promise<unknown> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
