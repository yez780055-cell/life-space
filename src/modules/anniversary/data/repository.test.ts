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
    expect(yearly).toMatchObject({ milestoneEnabled: false, milestoneDays: [] });
    expect(yearly.id).not.toBe(once.id);
    expect(await listAnniversaries()).toHaveLength(2);
  });

  it('normalizes custom milestones on create and update and rejects invalid or out-of-range nodes', async () => {
    const created = await createAnniversary({ title: '节点', date: '2024-01-01', recurrence: 'once', milestoneEnabled: true, milestoneDays: [1314, 500, 520, 500] });
    expect(created).toMatchObject({ milestoneEnabled: true, milestoneDays: [500, 520, 1314] });
    const updated = await updateAnniversary(created.id, { title: '节点', date: '2024-01-01', recurrence: 'yearly', milestoneEnabled: false, milestoneDays: [666, 520, 666] });
    expect(updated).toMatchObject({ id: created.id, createdAt: created.createdAt, milestoneEnabled: false, milestoneDays: [520, 666] });
    await expect(createAnniversary({ title: '非法节点', date: '2024-01-01', recurrence: 'once', milestoneDays: [0] })).rejects.toThrow('大于 0 的整数');
    await expect(createAnniversary({ title: '日期边界', date: '9999-12-31', recurrence: 'once', milestoneDays: [2] })).rejects.toThrow('不能超过 1 天');
  });

  it('reads v6 records written before the milestone fields existed without rewriting them', async () => {
    const legacy = { id: 'legacy-v6', title: '旧版纪念日', date: '2024-02-29', recurrence: 'yearly', createdAt: '2024-02-29T00:00:00.000Z', updatedAt: '2024-02-29T00:00:00.000Z' };
    const db = await openDatabase();
    const tx = db.transaction('anniversaryRecords', 'readwrite');
    tx.objectStore('anniversaryRecords').put(legacy);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    expect(await listAnniversaries()).toEqual([{ ...legacy, milestoneEnabled: false, milestoneDays: [] }]);
    expect(db.version).toBe(6);
    expect(await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('anniversaryRecords', 'readonly').objectStore('anniversaryRecords').get(legacy.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })).toEqual(legacy);
    db.close();
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
