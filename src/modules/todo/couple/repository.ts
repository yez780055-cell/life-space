import { openDatabase } from '../../../shared/storage/database';
import { normalizeCoupleTagName, validateCoupleItemDraft, type CoupleItem, type CoupleItemDraft, type CoupleTag } from './model';

function newId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function transaction(stores: string[], mode: IDBTransactionMode, apply: (tx: IDBTransaction, fail: (error: Error) => void) => void): Promise<void> {
  return openDatabase().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let failure: Error | undefined;
    const fail = (error: Error) => { failure = error; try { tx.abort(); } catch { reject(error); } };
    tx.oncomplete = () => failure ? reject(failure) : resolve();
    tx.onerror = () => reject(failure ?? tx.error ?? new Error('情侣事项写入失败'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('情侣事项写入中断'));
    try { apply(tx, fail); } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  }));
}

function readAll<T>(storeName: 'coupleItems' | 'coupleTags'): Promise<T[]> {
  return openDatabase().then((db) => new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('读取情侣事项失败'));
  }));
}

function assertRevision(existing: CoupleItem | undefined, expectedRevision?: number) {
  if (!existing) {
    if (expectedRevision !== undefined) throw new Error('这项情侣事项已不存在，请刷新后重试。');
    return;
  }
  if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
    throw new Error('这项情侣事项已在其他位置更新，请刷新后再保存。');
  }
}

export const coupleRepository = {
  listItems: () => readAll<CoupleItem>('coupleItems'),
  listTags: async () => (await readAll<CoupleTag>('coupleTags')).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),

  async saveItem(draft: CoupleItemDraft): Promise<CoupleItem> {
    const error = validateCoupleItemDraft(draft);
    if (error) throw new Error(error);
    let saved: CoupleItem | undefined;
    await transaction(['coupleItems', 'coupleTags'], 'readwrite', (tx, fail) => {
      const itemStore = tx.objectStore('coupleItems');
      const tagsStore = tx.objectStore('coupleTags');
      const tagsRequest = tagsStore.getAll();
      const existingRequest = draft.id ? itemStore.get(draft.id) : undefined;
      let tagsLoaded = false;
      let itemLoaded = !existingRequest;
      let tags: CoupleTag[] = [];
      let existing: CoupleItem | undefined;
      const commit = () => {
        if (!tagsLoaded || !itemLoaded) return;
        if (draft.id && !existing) return fail(new Error('找不到这项情侣事项，请刷新后重试。'));
        try { assertRevision(existing, draft.expectedRevision); } catch (error) { return fail(error as Error); }
        const validTagIds = new Set(tags.map((tag) => tag.id));
        const selectedTagIds = [...new Set(draft.tags)];
        if (selectedTagIds.some((tagId) => !validTagIds.has(tagId))) return fail(new Error('标签已不存在，请刷新后重试。'));
        const now = Date.now();
        saved = {
          id: existing?.id ?? draft.id ?? newId(),
          title: draft.title.trim(),
          scheduledDate: draft.scheduledDate,
          scheduledTime: draft.scheduledDate ? draft.scheduledTime : null,
          tags: selectedTagIds,
          note: draft.note.trim(),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          completedAt: existing?.completedAt ?? null,
          revision: (existing?.revision ?? 0) + 1
        };
        itemStore.put(saved);
      };
      tagsRequest.onsuccess = () => { tags = tagsRequest.result as CoupleTag[]; tagsLoaded = true; commit(); };
      tagsRequest.onerror = () => fail(tagsRequest.error ?? new Error('读取情侣标签失败'));
      if (existingRequest) {
        existingRequest.onsuccess = () => { existing = existingRequest.result as CoupleItem | undefined; itemLoaded = true; commit(); };
        existingRequest.onerror = () => fail(existingRequest.error ?? new Error('读取情侣事项失败'));
      }
    });
    if (!saved) throw new Error('事项没有保存成功，请重试。');
    return saved;
  },

  async createQuickItem(title: string): Promise<CoupleItem> {
    return this.saveItem({ title, scheduledDate: null, scheduledTime: null, tags: [], note: '' });
  },

  async setCompleted(itemId: string, completedAt: number | null, expectedRevision?: number): Promise<CoupleItem> {
    let saved: CoupleItem | undefined;
    await transaction(['coupleItems'], 'readwrite', (tx, fail) => {
      const store = tx.objectStore('coupleItems');
      const request = store.get(itemId);
      request.onsuccess = () => {
        const existing = request.result as CoupleItem | undefined;
        if (!existing) return fail(new Error('找不到这项情侣事项，请刷新后重试。'));
        try { assertRevision(existing, expectedRevision); } catch (error) { return fail(error as Error); }
        saved = { ...existing, completedAt, updatedAt: Date.now(), revision: existing.revision + 1 };
        store.put(saved);
      };
      request.onerror = () => fail(request.error ?? new Error('读取情侣事项失败'));
    });
    if (!saved) throw new Error('事项状态没有保存成功，请重试。');
    return saved;
  },

  async deleteItem(itemId: string, expectedRevision?: number): Promise<void> {
    await transaction(['coupleItems'], 'readwrite', (tx, fail) => {
      const store = tx.objectStore('coupleItems');
      const request = store.get(itemId);
      request.onsuccess = () => {
        const existing = request.result as CoupleItem | undefined;
        if (!existing) return fail(new Error('这项情侣事项已不存在，请刷新后重试。'));
        try { assertRevision(existing, expectedRevision); } catch (error) { return fail(error as Error); }
        store.delete(itemId);
      };
      request.onerror = () => fail(request.error ?? new Error('读取情侣事项失败'));
    });
  },

  async upsertTag(value: string): Promise<CoupleTag> {
    const name = value.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeCoupleTagName(name);
    if (!normalizedName) throw new Error('标签名称不能为空。');
    if ([...name].length > 40) throw new Error('标签不能超过 40 个字符。');
    let saved: CoupleTag | undefined;
    await transaction(['coupleTags'], 'readwrite', (tx, fail) => {
      const store = tx.objectStore('coupleTags');
      const request = store.index('normalizedName').get(normalizedName);
      request.onsuccess = () => {
        const existing = request.result as CoupleTag | undefined;
        if (existing) { saved = existing; return; }
        saved = { id: newId(), name, normalizedName, color: null, createdAt: Date.now() };
        store.add(saved);
      };
      request.onerror = () => fail(request.error ?? new Error('读取情侣标签失败'));
    });
    if (!saved) throw new Error('标签没有保存成功，请重试。');
    return saved;
  },

  async deleteTag(tagId: string): Promise<void> {
    await transaction(['coupleItems', 'coupleTags'], 'readwrite', (tx, fail) => {
      const itemsRequest = tx.objectStore('coupleItems').getAll();
      const tagRequest = tx.objectStore('coupleTags').get(tagId);
      let items: CoupleItem[] | undefined;
      let tag: CoupleTag | null | undefined;
      const remove = () => {
        if (!items || tag === undefined) return;
        if (!tag) return fail(new Error('找不到这个情侣标签。'));
        if (items.some((item) => item.tags.includes(tagId))) return fail(new Error('请先从关联的情侣事项中移除这个标签。'));
        tx.objectStore('coupleTags').delete(tagId);
      };
      itemsRequest.onsuccess = () => { items = itemsRequest.result as CoupleItem[]; remove(); };
      itemsRequest.onerror = () => fail(itemsRequest.error ?? new Error('读取情侣事项失败'));
      tagRequest.onsuccess = () => { tag = (tagRequest.result as CoupleTag | undefined) ?? null; remove(); };
      tagRequest.onerror = () => fail(tagRequest.error ?? new Error('读取情侣标签失败'));
    });
  }
};
