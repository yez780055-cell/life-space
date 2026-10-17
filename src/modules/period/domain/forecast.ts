import type { AppSettings, Forecast, PeriodRecord } from '../types'
import { addDays, daysBetween, localDateString } from './date'
import { average, completedPeriodLength, getPeriodOnDate, sortPeriods } from './periods'

const MIN_VALID_CYCLE = 15
const MAX_VALID_CYCLE = 90
const MAX_RECENT_CYCLES = 6
const HIGH_VARIABILITY_DAYS = 7

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function calculateForecast(
  periods: PeriodRecord[],
  settings: Pick<AppSettings, 'referenceCycleLength' | 'referencePeriodLength'>,
  today = localDateString()
): Forecast {
  const sorted = sortPeriods(periods)
  if (sorted.length === 0) {
    return {
      status: 'no-records', reason: '先记录一次经期，才能确定预测起点。', expectedStart: null,
      windowStart: null, windowEnd: null, periodLength: null, averageCycle: null,
      sampleCount: null, daysUntil: null, basis: null, confidence: null
    }
  }

  const starts = sorted.map((period) => period.startDate)
  const intervals = starts.slice(1)
    .map((start, index) => daysBetween(starts[index], start))
    .filter((days) => Number.isFinite(days) && days >= MIN_VALID_CYCLE && days <= MAX_VALID_CYCLE)
    .slice(-MAX_RECENT_CYCLES)
  const historicalMedian = intervals.length >= 3 ? median(intervals) : null
  const recentCycle = intervals.at(-1) ?? null
  const referenceCycle = settings.referenceCycleLength
  const cycle = historicalMedian ?? recentCycle ?? referenceCycle
  if (!cycle || cycle < 15 || cycle > 90) {
    return {
      status: 'insufficient-data',
      reason: starts.length < 2
        ? '目前只有一次经期开始记录。再记录一次，或在设置中填写参考周期后即可预测。'
        : '暂时没有可用的有效周期间隔。请核实历史记录，或在设置中填写参考周期后再预测。',
      expectedStart: null, windowStart: null, windowEnd: null, periodLength: null,
      averageCycle: null, sampleCount: null, daysUntil: null, basis: null, confidence: null
    }
  }

  const latestStart = starts[starts.length - 1]
  const expectedStart = addDays(latestStart, Math.round(cycle))
  const basis = historicalMedian !== null ? 'history' : recentCycle !== null ? 'recent-cycle' : 'reference'
  const spread = intervals.length > 1 ? Math.max(...intervals) - Math.min(...intervals) : 0
  const highVariability = intervals.length > 1 && spread > HIGH_VARIABILITY_DAYS
  const cycleOffsets = intervals.map((interval) => interval - Math.round(cycle))
  const earlyOffset = basis === 'reference' ? -2 : Math.min(-1, ...cycleOffsets)
  const lateOffset = basis === 'reference' ? 2 : Math.max(1, ...cycleOffsets)

  const completedLengths = sorted.map(completedPeriodLength).filter((length): length is number => length !== null).slice(-6)
  const periodLength = average(completedLengths) ?? settings.referencePeriodLength
  const confidence = basis === 'reference' || intervals.length < 3 || highVariability
    ? 'low'
    : intervals.length >= 4 && spread <= 4 ? 'high' : 'medium'
  const basisReason = basis === 'history'
    ? `根据最近 ${intervals.length} 个有效周期的中位数估算。`
    : basis === 'recent-cycle'
      ? `根据最近一个有效周期长度推算（共 ${intervals.length} 个有效间隔可参考），样本尚少。`
      : '记录尚少，按你设置的参考周期估算。'
  const reason = highVariability
    ? `${basisReason}近期周期波动较大，预测可信度较低，请核实历史记录。`
    : basisReason
  return {
    status: 'ready',
    reason,
    expectedStart,
    windowStart: addDays(expectedStart, earlyOffset),
    windowEnd: addDays(expectedStart, lateOffset),
    periodLength: periodLength ? Math.round(periodLength) : null,
    averageCycle: Math.round(cycle),
    sampleCount: intervals.length,
    daysUntil: daysBetween(today, expectedStart),
    basis,
    confidence
  }
}

export function isForecastDate(date: string, forecast: Forecast): boolean {
  if (forecast.status !== 'ready' || !forecast.expectedStart || !forecast.periodLength) return false
  const markedEnd = addDays(forecast.expectedStart, forecast.periodLength - 1)
  return date >= forecast.expectedStart && date <= markedEnd
}

export function isForecastWindowDate(date: string, forecast: Forecast): boolean {
  return forecast.status === 'ready'
    && !!forecast.windowStart
    && !!forecast.windowEnd
    && date >= forecast.windowStart
    && date <= forecast.windowEnd
}

export type CalendarDateType = 'actual' | 'predicted' | 'uncertain' | 'none'

export function classifyCalendarDate(
  date: string,
  periods: PeriodRecord[],
  forecast: Forecast,
  today = localDateString()
): CalendarDateType {
  if (getPeriodOnDate(periods, date, today)) return 'actual'
  if (isForecastDate(date, forecast)) return 'predicted'
  if (isForecastWindowDate(date, forecast)) return 'uncertain'
  return 'none'
}

export function forecastCountdown(forecast: Forecast): string | null {
  if (forecast.status !== 'ready' || forecast.daysUntil === null) return null
  if (forecast.daysUntil < 0) return `已过预计日期 ${Math.abs(forecast.daysUntil)} 天`
  if (forecast.daysUntil === 0) return '预计今天开始'
  return `还有 ${forecast.daysUntil} 天`
}
