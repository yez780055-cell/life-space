import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, formatShortRange, localDateString, monthGrid, shiftMonth } from './date'

describe('local calendar dates', () => {
  it('keeps dates stable across month and year boundaries', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01')
    expect(daysBetween('2024-12-30', '2025-01-02')).toBe(3)
    expect(shiftMonth('2024-12-12', 1)).toBe('2025-01-01')
  })

  it('includes leap day and returns whole calendar weeks', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
    expect(monthGrid('2024-02-01').length % 7).toBe(0)
    expect(monthGrid('2024-02-01')).toContain('2024-02-29')
  })

  it('formats a date using local calendar fields', () => {
    expect(localDateString(new Date(2024, 0, 2, 23, 30))).toBe('2024-01-02')
    expect(formatShortRange('2024-12-30', '2025-01-02')).toBe('2024年12月30日 – 2025年1月2日')
  })
})
