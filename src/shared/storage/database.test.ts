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

  it('preserves version 1 settings while adding module storage', async () => {
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
    const db = await openDatabase();
    expect(db.version).toBe(2);
    expect(await readValue('settings', 'lastModule')).toBe('anniversary');
    await moduleStorage('todo').write('sample', 'kept separate');
    expect(await moduleStorage('todo').read('sample')).toBe('kept separate');
  });
});
