import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, openDatabase, resetDatabaseConnectionForTests } from '../../../shared/storage/database';
import { createAnniversary, deleteAnniversary, listAnniversaries, updateAnniversary } from './repository';

async function clearDatabase() {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(clearDatabase);

describe('Anniversary repository', () => {
  it('starts empty and stores multiple same-day yearly and once records independently', async () => {
    expect(await listAnniversaries()).toEqual([]);
    const yearly = await createAnniversary({ title: '  相识日  ', date: '2024-06-24', recurrence: 'yearly' });
    const once = await createAnniversary({ title: '旅行', date: '2024-06-24', recurrence: 'once' });
    expect(yearly.title).toBe('相识日');
    expect(yearly.id).not.toBe(once.id);
    expect(await listAnniversaries()).toHaveLength(2);
  });

  it('validates required values and normalizes optional notes', async () => {
    await expect(createAnniversary({ title: ' \n ', date: '2024-01-01', recurrence: 'yearly' })).rejects.toThrow('请填写');
    await expect(createAnniversary({ title: '日期错误', date: '2025-02-29', recurrence: 'yearly' })).rejects.toThrow('有效日期');
    await expect(createAnniversary({ title: '类型错误', date: '2025-02-28', recurrence: 'daily' as 'yearly' })).rejects.toThrow('类型');
    const note = await createAnniversary({ title: '  记录  ', date: '1900-01-01', recurrence: 'once', note: '  一句话  ' });
    expect(note).toMatchObject({ title: '记录', note: '一句话' });
    const noNote = await createAnniversary({ title: '空备注', date: '2126-12-31', recurrence: 'once', note: '  ' });
    expect(noNote).not.toHaveProperty('note');
  });

  it('updates fields while retaining ID and creation time, then deletes only the selected record', async () => {
    const original = await createAnniversary({ title: '原名', date: '2020-01-02', recurrence: 'once' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await updateAnniversary(original.id, { title: '新名', date: '2020-01-03', recurrence: 'yearly', note: '备注' });
    expect(updated).toMatchObject({ id: original.id, createdAt: original.createdAt, title: '新名', date: '2020-01-03', recurrence: 'yearly', note: '备注' });
    expect(updated.updatedAt).not.toBe(original.updatedAt);
    const other = await createAnniversary({ title: '同日期另一条', date: '2020-01-03', recurrence: 'once' });
    await deleteAnniversary(updated.id);
    expect((await listAnniversaries()).map((item) => item.id)).toEqual([other.id]);
  });

  it('persists after reopening and leaves every other Life Space store untouched', async () => {
    const db = await openDatabase();
    const names = ['settings', 'modules', 'todoTasks', 'todoTags', 'todoOccurrences', 'coupleItems', 'coupleTags', 'periodRecords', 'periodSettings'];
    const tx = db.transaction(names, 'readwrite');
    tx.objectStore('settings').put({ privateSetting: 'preserved' }, 'sample');
    tx.objectStore('modules').put({ selection: 'period' }, 'sample');
    tx.objectStore('todoTasks').put({ id: 't-1', title: 'personal' });
    tx.objectStore('todoTags').put({ id: 'tt-1', normalizedName: 'personal' });
    tx.objectStore('todoOccurrences').put({ key: 't-1:2026-10-17', taskId: 't-1' });
    tx.objectStore('coupleItems').put({ id: 'c-1', title: 'couple' });
    tx.objectStore('coupleTags').put({ id: 'ct-1', normalizedName: 'couple' });
    tx.objectStore('periodRecords').put({ id: 'p-1', startDate: '2026-10-01', endDate: null });
    tx.objectStore('periodSettings').put({ key: 'root', value: { privatePeriodSetting: 'kept' } });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });

    const created = await createAnniversary({ title: '本地记录', date: '2026-10-17', recurrence: 'yearly' });
    resetDatabaseConnectionForTests();
    expect(await listAnniversaries()).toEqual([created]);
    const reopened = await openDatabase();
    expect(await new Promise<Record<string, unknown[]>>((resolve, reject) => {
      const readTx = reopened.transaction(names, 'readonly');
      const values: Record<string, unknown[]> = {};
      let complete = 0;
      names.forEach((name) => {
        const store = readTx.objectStore(name);
        const request = store.getAll();
        request.onsuccess = () => { values[name] = request.result; complete += 1; if (complete === names.length) resolve(values); };
        request.onerror = () => reject(request.error);
      });
      readTx.onerror = () => reject(readTx.error);
    })).toMatchObject({
      settings: [{ privateSetting: 'preserved' }],
      modules: [{ selection: 'period' }],
      todoTasks: [{ id: 't-1', title: 'personal' }],
      todoTags: [{ id: 'tt-1', normalizedName: 'personal' }],
      todoOccurrences: [{ key: 't-1:2026-10-17', taskId: 't-1' }],
      coupleItems: [{ id: 'c-1', title: 'couple' }],
      coupleTags: [{ id: 'ct-1', normalizedName: 'couple' }],
      periodRecords: [{ id: 'p-1', startDate: '2026-10-01', endDate: null }],
      periodSettings: [{ key: 'root', value: { privatePeriodSetting: 'kept' } }]
    });
    reopened.close();
  });
});
