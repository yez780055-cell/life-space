import type { AppData, AppSettings } from '../types';

export function defaultSettings(): AppSettings {
  return {
    onboardingComplete: true,
    referenceCycleLength: null,
    referencePeriodLength: null,
    careMemo: '',
    reminders: {
      forecastEnabled: false,
      forecastDaysBefore: 3,
      forecastTime: '20:00',
      checkEnabled: false,
      checkAfterDays: 8,
      checkTime: '20:00'
    },
    appLock: { enabled: false, salt: null, hash: null },
    deliveredReminders: []
  };
}

export function emptyAppData(): AppData {
  return { periods: [], settings: defaultSettings() };
}

export function normalizeAppData(value: Partial<AppData>): AppData {
  const defaults = defaultSettings();
  const settings = value?.settings ?? defaults;
  return {
    periods: Array.isArray(value?.periods) ? value.periods : [],
    settings: {
      ...defaults,
      ...settings,
      reminders: { ...defaults.reminders, ...(settings.reminders ?? {}) },
      appLock: { ...defaults.appLock, ...(settings.appLock ?? {}) },
      deliveredReminders: Array.isArray(settings.deliveredReminders) ? settings.deliveredReminders : []
    }
  };
}