import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, resetDatabaseConnectionForTests } from '../../../shared/storage/database';
import { todayKey } from '../data/dates';
import { todoRepository } from '../data/repository';
import { coupleRepository } from './repository';

async function removeDatabase() {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(removeDatabase);

describe('couple repository', () => {
  it('creates, edits, completes, reloads, restores, and deletes without touching personal tasks', async () => {
    const personal = await todoRepository.createQuickTask('个人私密事项', todayKey());
    const quick = await coupleRepository.createQuickItem('一起买咖啡豆');
    expect(quick.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(quick).toMatchObject({ title: '一起买咖啡豆', scheduledDate: null, scheduledTime: null, completedAt: null, revision: 1 });
    const saved = await coupleRepository.saveItem({
      id: quick.id, expectedRevision: quick.revision, title: '一起买咖啡豆和滤纸', scheduledDate: todayKey(), scheduledTime: '10:30', tags: [], note: '路过时购买'
    });
    expect(saved).toMatchObject({ id: quick.id, createdAt: quick.createdAt, title: '一起买咖啡豆和滤纸', scheduledDate: todayKey(), revision: 2 });
    await expect(coupleRepository.saveItem({
      id: quick.id, expectedRevision: quick.revision, title: '过期编辑', scheduledDate: null, scheduledTime: null, tags: [], note: ''
    })).rejects.toThrow('其他位置更新');

    const completed = await coupleRepository.setCompleted(saved.id, Date.now(), saved.revision);
    expect(completed.completedAt).toBeTypeOf('number');
    expect(completed.revision).toBe(3);
    resetDatabaseConnectionForTests();
    expect(await coupleRepository.listItems()).toEqual([completed]);
    expect(await todoRepository.listTasks()).toEqual([personal]);

    const restored = await coupleRepository.setCompleted(completed.id, null, completed.revision);
    expect(restored.completedAt).toBeNull();
    expect(await coupleRepository.listItems()).toHaveLength(1);
    await coupleRepository.deleteItem(restored.id, restored.revision);
    expect(await coupleRepository.listItems()).toEqual([]);
    expect(await todoRepository.listTasks()).toEqual([personal]);
  });

  it('keeps couple tags separate, normalizes duplicates, and refuses dangling tag deletion', async () => {
    const tag = await coupleRepository.upsertTag('  周末   约会 ');
    expect(await coupleRepository.upsertTag('周末 约会')).toEqual(tag);
    const personalTag = await todoRepository.upsertTag('周末 约会');
    const item = await coupleRepository.saveItem({ title: '散步', scheduledDate: null, scheduledTime: null, tags: [tag.id], note: '' });
    expect(item.tags).toEqual([tag.id]);
    expect((await todoRepository.listTags()).map((entry) => entry.id)).toEqual([personalTag.id]);
    await expect(coupleRepository.deleteTag(tag.id)).rejects.toThrow('先从关联');
    expect(await coupleRepository.listTags()).toEqual([tag]);
    await coupleRepository.saveItem({ id: item.id, expectedRevision: item.revision, title: item.title, scheduledDate: null, scheduledTime: null, tags: [], note: item.note });
    await coupleRepository.deleteTag(tag.id);
    expect(await coupleRepository.listTags()).toEqual([]);
  });

  it('rejects missing tags and item deletion with a stale revision', async () => {
    await expect(coupleRepository.upsertTag('标'.repeat(41))).rejects.toThrow('40 个字符');
    await expect(coupleRepository.saveItem({ title: '无效标签', scheduledDate: null, scheduledTime: null, tags: ['missing'], note: '' })).rejects.toThrow('标签已不存在');
    const item = await coupleRepository.createQuickItem('旧版本删除');
    const changed = await coupleRepository.saveItem({ id: item.id, expectedRevision: item.revision, title: '已修改', scheduledDate: null, scheduledTime: null, tags: [], note: '' });
    await expect(coupleRepository.deleteItem(changed.id, item.revision)).rejects.toThrow('其他位置更新');
    expect(await coupleRepository.listItems()).toEqual([changed]);
  });
});
