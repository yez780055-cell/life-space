import type { AppData, AppSettings, PeriodRecord } from '../types';
import { defaultSettings, normalizeAppData } from '../domain/storage';
import { openDatabase } from '../../../shared/storage/database';

const SETTINGS_KEY = 'root';

export interface PeriodSnapshot {
  periods: PeriodRecord[];
  settings: AppSettings;
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

export async function loadPeriodSnapshot(): Promise<PeriodSnapshot> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['periodRecords', 'periodSettings'], 'readonly');
    const recordsRequest = tx.objectStore('periodRecords').getAll();
    const settingsRequest = tx.objectStore('periodSettings').get(SETTINGS_KEY);
    let result: PeriodSnapshot | undefined;
    let ready = 0;
    const finishRead = () => {
      ready += 1;
      if (ready !== 2) return;
      const settings = (settingsRequest.result?.value ?? defaultSettings()) as AppSettings;
      const normalized = normalizeAppData({ periods: recordsRequest.result as PeriodRecord[], settings });
      result = { periods: normalized.periods, settings: normalized.settings };
    };
    recordsRequest.onsuccess = finishRead;
    settingsRequest.onsuccess = finishRead;
    recordsRequest.onerror = () => { tx.abort(); };
    settingsRequest.onerror = () => { tx.abort(); };
    tx.oncomplete = () => result ? resolve(result) : reject(new Error('无法读取小月历本机数据。'));
    tx.onerror = () => reject(asError(tx.error, '无法读取小月历本机数据。'));
    tx.onabort = () => reject(asError(tx.error, '读取小月历本机数据中断。'));
  });
}

function hasSettingsData(settings: AppSettings): boolean {
  const defaults = defaultSettings();
  return settings.onboardingComplete !== defaults.onboardingComplete ||
    settings.referenceCycleLength !== defaults.referenceCycleLength ||
    settings.referencePeriodLength !== defaults.referencePeriodLength ||
    settings.careMemo !== defaults.careMemo ||
    JSON.stringify(settings.reminders) !== JSON.stringify(defaults.reminders) ||
    JSON.stringify(settings.appLock) !== JSON.stringify(defaults.appLock) ||
    settings.deliveredReminders.length > 0;
}
export async function updatePeriodSettings(update: Partial<AppSettings>): Promise<AppSettings> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('periodSettings', 'readwrite');
    const store = tx.objectStore('periodSettings');
    const request = store.get(SETTINGS_KEY);
    let updated: AppSettings | undefined;
    request.onsuccess = () => {
      const current = (request.result?.value ?? defaultSettings()) as AppSettings;
      updated = normalizeAppData({ periods: [], settings: { ...current, ...update } }).settings;
      // Keep every field in the Period-owned namespace; no global settings are used.
      store.put({ key: SETTINGS_KEY, value: { ...current, ...update } });
    };
    tx.oncomplete = () => resolve(updated ?? defaultSettings());
    tx.onerror = () => reject(asError(tx.error, '保存小月历设置失败，请检查设备存储后重试。'));
    tx.onabort = () => reject(asError(tx.error, '保存小月历设置中断，请检查设备存储后重试。'));
  });
}

export async function mutatePeriodRecords<T>(
  mutate: (current: PeriodRecord[]) => { periods: PeriodRecord[]; value: T }
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('periodRecords', 'readwrite');
    const store = tx.objectStore('periodRecords');
    const request = store.getAll();
    let value: T;
    let failed: Error | undefined;
    request.onsuccess = () => {
      try {
        const result = mutate(request.result as PeriodRecord[]);
        value = result.value;
        store.clear();
        result.periods.forEach((period) => store.put(period));
      } catch (error) {
        failed = asError(error, '无法更新小月历记录。');
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(value!);
    tx.onerror = () => reject(failed ?? asError(tx.error, '保存经期记录失败，请检查设备存储后重试。'));
    tx.onabort = () => reject(failed ?? asError(tx.error, '保存经期记录中断，请检查设备存储后重试。'));
  });
}

export async function replacePeriodData(data: AppData, allowOverwrite: boolean): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['periodRecords', 'periodSettings'], 'readwrite');
    const records = tx.objectStore('periodRecords');
    const settings = tx.objectStore('periodSettings');
    const readRecords = records.getAll();
    const readSettings = settings.get(SETTINGS_KEY);
    let failed: Error | undefined;
    let ready = 0;
    const apply = () => {
      ready += 1;
      if (ready !== 2) return;
      const currentSettings = (readSettings.result?.value ?? defaultSettings()) as AppSettings;
      if ((readRecords.result.length > 0 || hasSettingsData(currentSettings)) && !allowOverwrite) {
        failed = new Error('当前已有小月历记录；请先导出加密备份并再次确认替换。');
        tx.abort();
        return;
      }
     try {
        records.clear();
        data.periods.forEach((period) => records.put(period));
        const importedSettings = data.settings;
        const safeSettings: AppSettings = {
          ...importedSettings,
          appLock: currentSettings.appLock,
          deliveredReminders: []
        };
        settings.put({ key: SETTINGS_KEY, value: safeSettings });
      } catch (error) {
        failed = asError(error, '导入失败，原有小月历数据未更改。');
        tx.abort();
      }
    };
    readRecords.onsuccess = apply;
    readSettings.onsuccess = apply;
    readRecords.onerror = () => { failed = new Error('读取现有小月历记录失败，未导入。'); tx.abort(); };
    readSettings.onerror = () => { failed = new Error('读取小月历设置失败，未导入。'); tx.abort(); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(failed ?? asError(tx.error, '导入失败，原有小月历数据未更改。'));
    tx.onabort = () => reject(failed ?? asError(tx.error, '导入已中断，原有小月历数据未更改。'));
  });
}

export async function claimPeriodReminder(key: string): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('periodSettings', 'readwrite');
    const store = tx.objectStore('periodSettings');
    const request = store.get(SETTINGS_KEY);
    let claimed = false;
    request.onsuccess = () => {
      const current = (request.result?.value ?? defaultSettings()) as AppSettings;
      if (current.deliveredReminders.includes(key)) return;
      claimed = true;
      const deliveredReminders = [...current.deliveredReminders, key].slice(-120);
      store.put({ key: SETTINGS_KEY, value: { ...current, deliveredReminders } });
    };
    request.onerror = () => { tx.abort(); };
    tx.oncomplete = () => resolve(claimed);
    tx.onerror = () => reject(asError(tx.error, '保存小月历提醒状态失败。'));
    tx.onabort = () => reject(asError(tx.error, '保存小月历提醒状态中断。'));
  });
}
export async function clearPeriodData(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['periodRecords', 'periodSettings'], 'readwrite');
    tx.objectStore('periodRecords').clear();
    tx.objectStore('periodSettings').put({ key: SETTINGS_KEY, value: defaultSettings() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(asError(tx.error, '清除小月历数据失败；其他空间的数据未受影响。'));
    tx.onabort = () => reject(asError(tx.error, '清除小月历数据中断；其他空间的数据未受影响。'));
  });
}