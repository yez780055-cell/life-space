export interface PeriodRecord {
  id: string
  startDate: string
  endDate: string | null
  createdAt: string
  updatedAt: string
}

export interface ReminderSettings {
  forecastEnabled: boolean
  forecastDaysBefore: number
  forecastTime: string
  checkEnabled: boolean
  checkAfterDays: number
  checkTime: string
}

export interface AppSettings {
  onboardingComplete: boolean
  referenceCycleLength: number | null
  referencePeriodLength: number | null
  careMemo: string
  reminders: ReminderSettings
  appLock: {
    enabled: boolean
    salt: string | null
    hash: string | null
  }
  deliveredReminders: string[]
}

export interface AppData {
  periods: PeriodRecord[]
  settings: AppSettings
}

export interface Forecast {
  status: 'ready' | 'no-records' | 'insufficient-data'
  reason: string
  expectedStart: string | null
  windowStart: string | null
  windowEnd: string | null
  periodLength: number | null
  averageCycle: number | null
  sampleCount: number | null
  daysUntil: number | null
  basis: 'history' | 'recent-cycle' | 'reference' | null
  confidence: 'low' | 'medium' | 'high' | null
}

export type Page = 'calendar' | 'stats' | 'settings'
