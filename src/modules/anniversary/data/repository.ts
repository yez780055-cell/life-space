import type { AnniversaryDraft, AnniversaryRecord } from '../types';
import { isValidDateKey } from '../domain/date';
import { normalizeMilestoneDays } from '../domain/milestones';
import { openDatabase } from '../../../shared/storage/database';
import { DEFAULT_ANNIVERSARY_ICON, isAnniversaryIconKey, normalizeAnniversaryIcon } from '../icons';

type NormalizedAnniversaryDraft = Omit<AnniversaryDraft, 'icon' | 'milestoneEnabled' | 'milestoneDays'> & Partial<Pick<AnniversaryRecord, 'icon'>> & Pick<AnniversaryRecord, 'milestoneEnabled' | 'milestoneDays'>;

function normalizeDraft(draft: AnniversaryDraft): NormalizedAnniversaryDraft {
  const title = typeof draft.title === 'string' ? draft.title.trim() : '';
  const note = typeof draft.note === 'string' ? draft.note.trim() : '';
  if (!title) throw new Error('请填写纪念日名称。');
  if (!isValidDateKey(draft.date)) throw new Error('请选择有效日期。');
  if (draft.recurrence !== 'yearly' && draft.recurrence !== 'once') throw new Error('请选择纪念日类型。');
  if (draft.icon !== undefined && !isAnniversaryIconKey(draft.icon)) throw new Error('请选择有效的纪念日图标。');
  if (draft.milestoneEnabled !== undefined && typeof draft.milestoneEnabled !== 'boolean') throw new Error('天数纪念开关设置无效。');
  const milestoneEnabled = draft.milestoneEnabled ?? false;
  const milestoneDays = normalizeMilestoneDays(draft.milestoneDays ?? [], draft.date);
  return {
    title,
    date: draft.date,
    recurrence: draft.recurrence,
    ...(draft.icon ? { icon: draft.icon } : {}),
    ...(note ? { note } : {}),
    milestoneEnabled,
    milestoneDays
  };
}

function normalizeStoredRecord(value: AnniversaryRecord): AnniversaryRecord {
  const milestoneEnabled = typeof value.milestoneEnabled === 'boolean' ? value.milestoneEnabled : false;
  let milestoneDays: number[] = [];
  try { milestoneDays = normalizeMilestoneDays(value.milestoneDays ?? [], value.date); }
  catch { /* Ignore invalid legacy extension fields without rewriting the stored record. */ }
  return { ...value, icon: normalizeAnniversaryIcon(value.icon), milestoneEnabled, milestoneDays };
}

function storageError(error: unknown, fallback: string): Error {
  if (error instanceof Error && (error.message.startsWith('请') || error.message.startsWith('选择'))) return error;
  return error instanceof Error ? new Error(`${fallback} ${error.message}`) : new Error(fallback);
}

function runTransaction<T>(
  transaction: IDBTransaction,
  result: () => T,
  fallback: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    let value: T;
    transaction.oncomplete = () => {
      try { value = result(); resolve(value); } catch (error) { reject(error); }
    };
    transaction.onerror = () => reject(storageError(transaction.error, fallback));
    transaction.onabort = () => reject(storageError(transaction.error, fallback));
  });
}

export async function listAnniversaries(): Promise<AnniversaryRecord[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('anniversaryRecords', 'readonly');
      const request = tx.objectStore('anniversaryRecords').getAll();
      let records: AnniversaryRecord[] | undefined;
      request.onsuccess = () => { records = request.result as AnniversaryRecord[]; };
      request.onerror = () => { tx.abort(); };
      tx.oncomplete = () => resolve((records ?? []).map(normalizeStoredRecord));
      tx.onerror = () => reject(storageError(tx.error, '读取纪念日失败，请检查设备存储。'));
      tx.onabort = () => reject(storageError(tx.error, '读取纪念日失败，请检查设备存储。'));
    });
  } catch (error) {
    throw storageError(error, '无法打开纪念日本地数据。');
  }
}

export async function createAnniversary(draft: AnniversaryDraft): Promise<AnniversaryRecord> {
  const normalized = normalizeDraft(draft);
  const now = new Date().toISOString();
  const record: AnniversaryRecord = { id: crypto.randomUUID(), ...normalized, icon: normalized.icon ?? DEFAULT_ANNIVERSARY_ICON, createdAt: now, updatedAt: now };
  try {
    const db = await openDatabase();
    const tx = db.transaction('anniversaryRecords', 'readwrite');
    tx.objectStore('anniversaryRecords').add(record);
    await runTransaction(tx, () => undefined, '保存纪念日失败，请检查设备存储。');
    return record;
  } catch (error) {
    throw storageError(error, '保存纪念日失败，请检查设备存储。');
  }
}

export async function updateAnniversary(id: string, draft: AnniversaryDraft): Promise<AnniversaryRecord> {
  const normalized = normalizeDraft(draft);
  try {
    const db = await openDatabase();
    const tx = db.transaction('anniversaryRecords', 'readwrite');
    const store = tx.objectStore('anniversaryRecords');
    const request = store.get(id);
    let updated: AnniversaryRecord | undefined;
    let failed: Error | undefined;
    request.onsuccess = () => {
      const current = request.result as AnniversaryRecord | undefined;
      if (!current) { failed = new Error('找不到要编辑的纪念日。'); tx.abort(); return; }
      updated = { ...current, ...normalized, icon: normalized.icon ?? normalizeAnniversaryIcon(current.icon), id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
      store.put(updated);
    };
    request.onerror = () => { failed = new Error('读取纪念日失败，请检查设备存储。'); tx.abort(); };
    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => updated ? resolve(updated) : reject(new Error('保存纪念日失败，请检查设备存储。'));
      tx.onerror = () => reject(failed ?? storageError(tx.error, '保存纪念日失败，请检查设备存储。'));
      tx.onabort = () => reject(failed ?? storageError(tx.error, '保存纪念日失败，请检查设备存储。'));
    });
  } catch (error) {
    if (error instanceof Error && error.message === '找不到要编辑的纪念日。') throw error;
    throw storageError(error, '保存纪念日失败，请检查设备存储。');
  }
}

export async function deleteAnniversary(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('anniversaryRecords', 'readwrite');
    tx.objectStore('anniversaryRecords').delete(id);
    await runTransaction(tx, () => undefined, '删除纪念日失败，请检查设备存储。');
  } catch (error) {
    throw storageError(error, '删除纪念日失败，请检查设备存储。');
  }
}
