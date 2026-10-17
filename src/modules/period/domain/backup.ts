import type { AppData, PeriodRecord } from '../types';
import { normalizeAppData } from './storage';
import { sortPeriods, validatePeriod } from './periods';
import { validateBackupData } from './security';

function hasOnlyKeys(value: object, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function prepareRestoredData(value: unknown, today: string): AppData {
  if (!validateBackupData(value) || !hasOnlyKeys(value, ['periods', 'settings'])) {
    throw new Error('备份文件内容不完整或格式无效，未更改本机数据。');
  }
  const raw = value as AppData;
  const lock = raw.settings.appLock;
  if (!lock || typeof lock !== 'object' || Array.isArray(lock) ||
      typeof lock.enabled !== 'boolean' ||
      !(lock.salt === null || typeof lock.salt === 'string') ||
      !(lock.hash === null || typeof lock.hash === 'string') ||
      (lock.enabled && (!lock.salt || !lock.hash))) {
    throw new Error('备份中的隐私设置格式无效，未更改本机数据。');
  }
  const settingsKeys = ['onboardingComplete', 'referenceCycleLength', 'referencePeriodLength', 'careMemo', 'reminders', 'appLock', 'deliveredReminders'];
  if (!hasOnlyKeys(raw.settings, settingsKeys) ||
      !hasOnlyKeys(raw.settings.reminders, ['forecastEnabled', 'forecastDaysBefore', 'forecastTime', 'checkEnabled', 'checkAfterDays', 'checkTime']) ||
      !hasOnlyKeys(raw.settings.appLock, ['enabled', 'salt', 'hash']) ||
      (raw.settings.deliveredReminders !== undefined && !Array.isArray(raw.settings.deliveredReminders))) {
    throw new Error('备份中含有不支持的字段，未更改本机数据。');
  }
  if (raw.periods.length > 10_000 || raw.settings.careMemo.length > 500 ||
      !raw.periods.every((period) => hasOnlyKeys(period, ['id', 'startDate', 'endDate', 'createdAt', 'updatedAt']) &&
        period.id.trim().length > 0 && period.id.length <= 200 &&
        validTimestamp(period.createdAt) && validTimestamp(period.updatedAt)) ||
      (raw.settings.deliveredReminders ?? []).some((item) => typeof item !== 'string' || item.length > 200)) {
    throw new Error('备份中存在非法字段，未更改本机数据。');
  }
  const restored = normalizeAppData(raw);
  const checked: PeriodRecord[] = [];
  const ids = new Set<string>();
  for (const period of sortPeriods(restored.periods)) {
    if (ids.has(period.id)) throw new Error('备份中存在重复记录编号，未更改本机数据。');
    const validation = validatePeriod(period, checked, { allowOngoing: true, today });
    if (!validation.valid) throw new Error('备份记录无法通过日期校验：' + (validation.message ?? '') + '未更改本机数据。');
    ids.add(period.id);
    checked.push(period);
  }
  restored.periods = checked;
  restored.settings.onboardingComplete = true;
  restored.settings.appLock = { enabled: false, salt: null, hash: null };
  restored.settings.deliveredReminders = [];
  return restored;
}
