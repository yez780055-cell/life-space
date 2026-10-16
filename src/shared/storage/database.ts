export const DB_NAME = 'life-space';
export const DB_VERSION = 4;

export type StoreName = 'settings' | 'modules' | 'todoTasks' | 'todoTags' | 'todoOccurrences' | 'coupleItems' | 'coupleTags';

let connection: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) db.createObjectStore('settings');
      if (event.oldVersion < 2) db.createObjectStore('modules');
      if (event.oldVersion < 3) {
        const tasks = db.createObjectStore('todoTasks', { keyPath: 'id' });
        tasks.createIndex('scheduledDate', 'scheduledDate', { unique: false });
        tasks.createIndex('seriesId', 'seriesId', { unique: false });
        const tags = db.createObjectStore('todoTags', { keyPath: 'id' });
        tags.createIndex('normalizedName', 'normalizedName', { unique: true });
        const occurrences = db.createObjectStore('todoOccurrences', { keyPath: 'key' });
        occurrences.createIndex('taskId', 'taskId', { unique: false });
        occurrences.createIndex('scheduledDate', 'scheduledDate', { unique: false });
      }
      if (event.oldVersion < 4) {
        const coupleItems = db.createObjectStore('coupleItems', { keyPath: 'id' });
        coupleItems.createIndex('scheduledDate', 'scheduledDate', { unique: false });
        coupleItems.createIndex('completedAt', 'completedAt', { unique: false });
        coupleItems.createIndex('createdAt', 'createdAt', { unique: false });
        const coupleTags = db.createObjectStore('coupleTags', { keyPath: 'id' });
        coupleTags.createIndex('normalizedName', 'normalizedName', { unique: true });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'));
    request.onblocked = () => { blocked = true; reject(new Error('本地数据库升级被其他页面阻止，请关闭其他页面后重试')); };
  }).catch((error) => { connection = undefined; throw error; });
  return connection;
}

export function resetDatabaseConnectionForTests() {
  connection?.then((db) => db.close()).catch(() => undefined);
  connection = undefined;
}

export async function readValue<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error('读取本地数据失败'));
  });
}

export async function writeValue<T>(store: StoreName, key: string, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('保存本地数据失败'));
    tx.onabort = () => reject(tx.error ?? new Error('保存本地数据中断'));
  });
}
