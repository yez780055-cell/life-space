import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, openDatabase, readValue, resetDatabaseConnectionForTests, writeValue } from './database';
import { loadLastModule, saveLastModule } from './settings';
import { moduleStorage } from './modules';

async function deleteDatabase() {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(deleteDatabase);

describe('local storage', () => {
  it('defaults to todo and rejects an invalid saved module', async () => {
    expect(await loadLastModule()).toBe('todo');
    await writeValue('settings', 'lastModule', 'surprise');
    expect(await loadLastModule()).toBe('todo');
    await saveLastModule('period');
    expect(await loadLastModule()).toBe('period');
  });

  it('keeps module namespaces separate', async () => {
    await moduleStorage('todo').write('same', { count: 1 });
    await moduleStorage('period').write('same', { count: 8 });
    expect(await moduleStorage('todo').read('same')).toEqual({ count: 1 });
    expect(await moduleStorage('period').read('same')).toEqual({ count: 8 });
    expect(await moduleStorage('anniversary').read('same')).toBeUndefined();
  });

  it('upgrades version 1 settings and modules to version 6 without dropping existing data', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put('anniversary', 'lastModule');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => request.result.createObjectStore('modules');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('modules', 'readwrite');
        tx.objectStore('modules').put({ preserved: true }, 'period:sample');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    const db = await openDatabase();
    expect(db.version).toBe(6);
    expect(['settings', 'modules', 'todoTasks', 'todoTags', 'todoOccurrences', 'coupleItems', 'coupleTags', 'periodRecords', 'periodSettings', 'anniversaryRecords'].every((store) => db.objectStoreNames.contains(store))).toBe(true);
    db.close();
    resetDatabaseConnectionForTests();
    expect(await readValue('settings', 'lastModule')).toBe('anniversary');
    expect(await moduleStorage('period').read('sample')).toEqual({ preserved: true });
    await moduleStorage('todo').write('sample', 'kept separate');
    expect(await moduleStorage('todo').read('sample')).toBe('kept separate');
  });

  it('adds couple stores to a version 3 database without rewriting existing personal tasks', async () => {
    const legacyTask = { id: 'personal-before-phase-2c', title: '原有个人事项', note: '保留备注', tags: ['personal-tag'], completedAt: null };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('settings');
        db.createObjectStore('modules');
        db.createObjectStore('todoTasks', { keyPath: 'id' });
        db.createObjectStore('todoTags', { keyPath: 'id' });
        db.createObjectStore('todoOccurrences', { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('todoTasks', 'readwrite');
        tx.objectStore('todoTasks').put(legacyTask);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const db = await openDatabase();
    expect(db.version).toBe(6);
    expect(db.objectStoreNames.contains('coupleItems')).toBe(true);
    expect(db.objectStoreNames.contains('coupleTags')).toBe(true);
    const read = (storeName: string, key: string) => new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (storeName: string) => new Promise<number>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(await read('todoTasks', legacyTask.id)).toEqual(legacyTask);
    expect(await count('coupleItems')).toBe(0);
    db.close();
    resetDatabaseConnectionForTests();
  });

  it('upgrades v5 to v6 by adding only Anniversary storage and preserving every existing store', async () => {
    const request = indexedDB.open(DB_NAME, 5);
    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('settings');
        db.createObjectStore('modules');
        const tasks = db.createObjectStore('todoTasks', { keyPath: 'id' });
        tasks.createIndex('scheduledDate', 'scheduledDate');
        tasks.createIndex('seriesId', 'seriesId');
        const tags = db.createObjectStore('todoTags', { keyPath: 'id' });
        tags.createIndex('normalizedName', 'normalizedName', { unique: true });
        const occurrences = db.createObjectStore('todoOccurrences', { keyPath: 'key' });
        occurrences.createIndex('taskId', 'taskId');
        occurrences.createIndex('scheduledDate', 'scheduledDate');
        const coupleItems = db.createObjectStore('coupleItems', { keyPath: 'id' });
        coupleItems.createIndex('scheduledDate', 'scheduledDate');
        coupleItems.createIndex('completedAt', 'completedAt');
        coupleItems.createIndex('createdAt', 'createdAt');
        const coupleTags = db.createObjectStore('coupleTags', { keyPath: 'id' });
        coupleTags.createIndex('normalizedName', 'normalizedName', { unique: true });
        const periodRecords = db.createObjectStore('periodRecords', { keyPath: 'id' });
        periodRecords.createIndex('startDate', 'startDate');
        periodRecords.createIndex('endDate', 'endDate');
        db.createObjectStore('periodSettings', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const names = ['settings', 'modules', 'todoTasks', 'todoTags', 'todoOccurrences', 'coupleItems', 'coupleTags', 'periodRecords', 'periodSettings'];
        const tx = db.transaction(names, 'readwrite');
        tx.objectStore('settings').put('anniversary', 'lastModule');
        tx.objectStore('modules').put({ saved: 'module-state' }, 'period:root');
        tx.objectStore('todoTasks').put({ id: 'todo-v5', title: 'existing todo' });
        tx.objectStore('todoTags').put({ id: 'todo-tag-v5', normalizedName: 'todo-tag' });
        tx.objectStore('todoOccurrences').put({ key: 'todo-v5:2026-10-17', taskId: 'todo-v5' });
        tx.objectStore('coupleItems').put({ id: 'couple-v5', title: 'existing couple item' });
        tx.objectStore('coupleTags').put({ id: 'couple-tag-v5', normalizedName: 'couple-tag' });
        tx.objectStore('periodRecords').put({ id: 'period-v5', startDate: '2026-10-01', endDate: null });
        tx.objectStore('periodSettings').put({ key: 'root', value: { referenceCycleLength: 28 } });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });

    const db = await openDatabase();
    expect(db.version).toBe(6);
    expect([...db.objectStoreNames].sort()).toEqual(['anniversaryRecords', 'coupleItems', 'coupleTags', 'modules', 'periodRecords', 'periodSettings', 'settings', 'todoOccurrences', 'todoTags', 'todoTasks'].sort());
    const read = (store: string, key: IDBValidKey) => new Promise<unknown>((resolve, reject) => {
      const readRequest = db.transaction(store, 'readonly').objectStore(store).get(key);
      readRequest.onsuccess = () => resolve(readRequest.result);
      readRequest.onerror = () => reject(readRequest.error);
    });
    expect(await read('settings', 'lastModule')).toBe('anniversary');
    expect(await read('modules', 'period:root')).toEqual({ saved: 'module-state' });
    expect(await read('todoTasks', 'todo-v5')).toEqual({ id: 'todo-v5', title: 'existing todo' });
    expect(await read('todoTags', 'todo-tag-v5')).toEqual({ id: 'todo-tag-v5', normalizedName: 'todo-tag' });
    expect(await read('todoOccurrences', 'todo-v5:2026-10-17')).toEqual({ key: 'todo-v5:2026-10-17', taskId: 'todo-v5' });
    expect(await read('coupleItems', 'couple-v5')).toEqual({ id: 'couple-v5', title: 'existing couple item' });
    expect(await read('coupleTags', 'couple-tag-v5')).toEqual({ id: 'couple-tag-v5', normalizedName: 'couple-tag' });
    expect(await read('periodRecords', 'period-v5')).toEqual({ id: 'period-v5', startDate: '2026-10-01', endDate: null });
    expect(await read('periodSettings', 'root')).toEqual({ key: 'root', value: { referenceCycleLength: 28 } });
    db.close();
    resetDatabaseConnectionForTests();
  });
});
