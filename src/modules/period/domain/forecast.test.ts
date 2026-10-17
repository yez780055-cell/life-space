import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import { calculateForecast, classifyCalendarDate, isForecastDate, isForecastWindowDate } from './forecast'
import type { AppSettings, PeriodRecord } from '../types'

const settings: Pick<AppSettings, 'referenceCycleLength' | 'referencePeriodLength'> = {
  referenceCycleLength: null,
  referencePeriodLength: null
}

function period(id: string, startDate: string, endDate: string | null): PeriodRecord {
  return { id, startDate, endDate, createdAt: '', updatedAt: '' }
}

function periodsFromIntervals(intervals: number[]): PeriodRecord[] {
  const starts = ['2024-01-01']
  for (const interval of intervals) starts.push(addDays(starts[starts.length - 1], interval))
  return starts.map((start, index) => period(String(index + 1), start, addDays(start, 4)))
}

describe('period forecast', () => {
  it('does not invent a prediction without a usable cycle or reference value', () => {
    expect(calculateForecast([], settings, '2024-03-10').status).toBe('no-records')
    expect(calculateForecast([period('1', '2024-02-01', '2024-02-05')], settings, '2024-03-10').status).toBe('insufficient-data')
  })

  it('uses the median of the latest six valid cycle intervals', () => {
    const records = periodsFromIntervals([27, 28, 28, 28, 29, 29, 29, 29])
    const result = calculateForecast(records, settings, '2024-03-01')
    const latestStart = records[records.length - 1].startDate
    expect(result.status).toBe('ready')
    expect(result.basis).toBe('history')
    expect(result.sampleCount).toBe(6)
    expect(result.averageCycle).toBe(29)
    expect(result.expectedStart).toBe(addDays(latestStart, 29))
    expect(result.reason).toContain('最近 6 个有效周期的中位数')
  })

  it('ignores intervals outside the valid cycle range', () => {
    const records = periodsFromIntervals([28, 120, 29, 28])
    const result = calculateForecast(records, settings, '2024-08-01')
    expect(result.status).toBe('ready')
    expect(result.basis).toBe('history')
    expect(result.sampleCount).toBe(3)
    expect(result.averageCycle).toBe(28)
    expect(result.expectedStart).toBe(addDays(records.at(-1)!.startDate, 28))
  })

  it('uses the latest observed cycle when there are fewer than three intervals', () => {
    const records = periodsFromIntervals([27, 31])
    const result = calculateForecast(records, { ...settings, referenceCycleLength: 35 }, '2024-03-01')
    expect(result.status).toBe('ready')
    expect(result.basis).toBe('recent-cycle')
    expect(result.averageCycle).toBe(31)
    expect(result.expectedStart).toBe(addDays(records.at(-1)!.startDate, 31))
    expect(result.reason).toContain('样本尚少')
  })

  it('uses an explicit reference value when there is no valid interval', () => {
    const result = calculateForecast([period('1', '2024-02-01', '2024-02-05')], {
      referenceCycleLength: 28, referencePeriodLength: 5
    }, '2024-02-10')
    expect(result.status).toBe('ready')
    expect(result.basis).toBe('reference')
    expect(result.confidence).toBe('low')
    expect(result.expectedStart).toBe('2024-02-29')
  })

  it('lowers confidence and asks the user to verify records when cycle variability is high', () => {
    const result = calculateForecast(periodsFromIntervals([28, 29, 45]), settings, '2024-04-15')
    expect(result.status).toBe('ready')
    expect(result.averageCycle).toBe(29)
    expect(result.confidence).toBe('low')
    expect(result.reason).toContain('周期波动较大')
    expect(result.reason).toContain('核实历史记录')
    expect(result.windowStart).toBe(addDays(result.expectedStart!, -1))
    expect(result.windowEnd).toBe(addDays(result.expectedStart!, 16))
  })

  it('keeps the purple band on the expected period only across a month boundary', () => {
    const result = calculateForecast([period('1', '2024-01-01', '2024-01-05')], {
      referenceCycleLength: 28, referencePeriodLength: 5
    }, '2024-01-10')
    expect(result.status).toBe('ready')
    expect(result.expectedStart).toBe('2024-01-29')
    expect(isForecastDate('2024-01-28', result)).toBe(false)
    expect(isForecastDate('2024-01-29', result)).toBe(true)
    expect(isForecastDate('2024-02-02', result)).toBe(true)
    expect(isForecastDate('2024-02-03', result)).toBe(false)
    expect(isForecastWindowDate('2024-01-27', result)).toBe(true)
    expect(isForecastDate('2024-01-27', result)).toBe(false)
    expect(classifyCalendarDate('2024-01-27', [], result, '2024-01-10')).toBe('uncertain')
  })

  it('always lets an actual period cover a predicted date', () => {
    const result = calculateForecast([period('1', '2024-01-01', '2024-01-05')], {
      referenceCycleLength: 28, referencePeriodLength: 5
    }, '2024-01-10')
    const actual = period('actual', '2024-01-30', null)
    expect(isForecastDate('2024-01-30', result)).toBe(true)
    expect(classifyCalendarDate('2024-01-30', [actual], result, '2024-01-30')).toBe('actual')
  })
})
