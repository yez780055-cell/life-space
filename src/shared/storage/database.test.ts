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

  it('upgrades version 1 settings and modules to version 5 without dropping existing data', async () => {
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
    expect(db.version).toBe(5);
    expect(['settings', 'modules', 'todoTasks', 'todoTags', 'todoOccurrences', 'coupleItems', 'coupleTags', 'periodRecords', 'periodSettings'].every((store) => db.objectStoreNames.contains(store))).toBe(true);
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
    expect(db.version).toBe(5);
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
});
