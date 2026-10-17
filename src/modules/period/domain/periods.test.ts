import { describe, expect, it } from 'vitest'
import { addCompletedPeriod, getHistoricalPeriodEndDateMax, getPeriodOnDate, togglePeriodForDate, undoPeriodToggle, validatePeriod, type PeriodToggleResult } from './periods'
import type { PeriodRecord } from '../types'

function period(id: string, startDate: string, endDate: string | null): PeriodRecord {
  return { id, startDate, endDate, createdAt: 'created', updatedAt: 'updated' }
}

const saved: PeriodRecord[] = [period('saved', '2024-03-02', '2024-03-06')]

function changed(result: PeriodToggleResult): Extract<PeriodToggleResult, { changed: true }> {
  if (!result.ok || !result.changed) throw new Error('Expected a period toggle change.')
  return result
}

describe('period validation', () => {
  it('rejects reversed dates and future records', () => {
    expect(validatePeriod({ startDate: '2024-03-07', endDate: '2024-03-06' }, saved, { today: '2024-03-10' }).valid).toBe(false)
    expect(validatePeriod({ startDate: '2024-03-11', endDate: null }, saved, { allowOngoing: true, today: '2024-03-10' }).valid).toBe(false)
  })

  it('rejects overlap, including sharing an endpoint', () => {
    expect(validatePeriod({ startDate: '2024-03-06', endDate: '2024-03-09' }, saved, { today: '2024-03-10' }).message).toContain('重叠')
    expect(validatePeriod({ startDate: '2024-03-07', endDate: '2024-03-09' }, saved, { today: '2024-03-10' }).valid).toBe(true)
  })

  it('allows editing the current record without conflicting with itself', () => {
    expect(validatePeriod({ startDate: '2024-03-01', endDate: '2024-03-05' }, saved, { excludeId: 'saved', today: '2024-03-10' }).valid).toBe(true)
  })

  it('allows only one ongoing record', () => {
    const ongoing = [...saved, period('b', '2024-03-08', null)]
    expect(validatePeriod({ startDate: '2024-03-10', endDate: null }, ongoing, { allowOngoing: true, today: '2024-03-10' }).valid).toBe(false)
  })
})

describe('period date toggle', () => {
  it('starts from the selected date and extends the actual period through today across months', () => {
    const today = '2024-04-02'
    const started = changed(togglePeriodForDate([], '2024-03-29', true, today))
    expect(started.action).toBe('started')
    expect(started.record.startDate).toBe('2024-03-29')
    expect(started.record.endDate).toBeNull()
    expect(getPeriodOnDate(started.periods, '2024-04-02', today)?.id).toBe(started.record.id)
    expect(getPeriodOnDate(started.periods, '2024-04-03', today)).toBeNull()
  })

  it('closes on the selected active date, keeps that end date included, and stops after it', () => {
    const today = '2024-04-02'
    const started = changed(togglePeriodForDate([], '2024-03-29', true, today))
    const ended = changed(togglePeriodForDate(started.periods, '2024-04-01', false, today))
    expect(ended.action).toBe('ended')
    expect(ended.record.endDate).toBe('2024-04-01')
    expect(getPeriodOnDate(ended.periods, '2024-04-01', today)?.id).toBe(ended.record.id)
    expect(getPeriodOnDate(ended.periods, '2024-04-02', today)).toBeNull()
  })

  it('cancels an ongoing record when the start date is switched off', () => {
    const started = changed(togglePeriodForDate([], '2024-03-10', true, '2024-03-10'))
    const cancelled = changed(togglePeriodForDate(started.periods, '2024-03-10', false, '2024-03-10'))
    expect(cancelled.action).toBe('cancelled')
    expect(cancelled.record).toEqual(started.record)
    expect(cancelled.periods).toEqual([])
    expect(getPeriodOnDate(cancelled.periods, '2024-03-10', '2024-03-10')).toBeNull()
    expect(validatePeriod({ startDate: '2024-03-10', endDate: '2024-03-10' }, [], { today: '2024-03-10' }).valid).toBe(true)
  })

  it('rejects future dates, overlaps, and attempts to add a second active period', () => {
    expect(togglePeriodForDate([], '2024-03-11', true, '2024-03-10').ok).toBe(false)
    expect(togglePeriodForDate(saved, '2024-03-05', true, '2024-03-10').ok).toBe(false)
    const ongoing = [period('ongoing', '2024-03-08', null)]
    const duplicate = togglePeriodForDate(ongoing, '2024-03-09', true, '2024-03-10')
    expect(duplicate.ok).toBe(true)
    if (duplicate.ok) expect(duplicate.changed).toBe(false)
    expect(togglePeriodForDate(ongoing, '2024-03-07', true, '2024-03-10')).toMatchObject({
      ok: true,
      changed: false,
      action: 'backfill-required',
      endDateMax: '2024-03-07'
    })
  })

  it('keeps completed historical dates read-only from the toggle', () => {
    expect(togglePeriodForDate(saved, '2024-03-03', true, '2024-03-10').ok).toBe(false)
    expect(togglePeriodForDate(saved, '2024-03-03', false, '2024-03-10').ok).toBe(false)
  })
})

describe('rapid period toggles and undo', () => {
  it('ignores duplicate starts and treats a same-day close as cancellation', () => {
    const today = '2024-03-10'
    const started = changed(togglePeriodForDate([], today, true, today))
    const duplicateStart = togglePeriodForDate(started.periods, today, true, today)
    expect(duplicateStart).toMatchObject({ ok: true, changed: false })

    const ended = changed(togglePeriodForDate(started.periods, today, false, today))
    expect(ended.action).toBe('cancelled')
    expect(ended.periods).toEqual([])
    expect(togglePeriodForDate(ended.periods, today, false, today).ok).toBe(false)
    expect(undoPeriodToggle(ended.periods, 'started', started.record, null)).toBeNull()

    const restored = undoPeriodToggle(ended.periods, 'cancelled', ended.record, started.record, today)
    expect(restored?.[0]).toMatchObject({ id: started.record.id, endDate: null, updatedAt: started.record.updatedAt })
  })

  it('refuses to undo an end if another period is now active', () => {
    const oldRecord = period('old', '2024-03-01', '2024-03-03')
    const activeRecord = period('active', '2024-03-10', null)
    const previous = period('old', '2024-03-01', null)
    expect(undoPeriodToggle([oldRecord, activeRecord], 'ended', oldRecord, previous)).toBeNull()
  })

  it('restores a cancelled start through undo, but refuses if another record replaced it', () => {
    const today = '2024-03-10'
    const started = changed(togglePeriodForDate([], today, true, today))
    const cancelled = changed(togglePeriodForDate(started.periods, today, false, today))

    const restored = undoPeriodToggle(cancelled.periods, 'cancelled', cancelled.record, started.record, today)
    expect(restored).toEqual(started.periods)

    const replacement = changed(togglePeriodForDate(cancelled.periods, today, true, today))
    expect(undoPeriodToggle(replacement.periods, 'cancelled', cancelled.record, started.record, today)).toBeNull()
  })
})

describe('historical period toggle backfill', () => {
  it('requests a fixed-start backfill modal and caps the end before the nearest later record', () => {
    const later = period('later', '2024-10-12', null)
    const other = period('other', '2024-11-20', '2024-11-24')
    const periods = [later, other]
    const result = togglePeriodForDate(periods, '2024-06-21', true, '2024-11-25')

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      action: 'backfill-required',
      startDate: '2024-06-21',
      endDateMax: '2024-10-11'
    })
    expect(result.periods).toBe(periods)
    expect(getHistoricalPeriodEndDateMax('2024-06-21', periods, '2024-11-25')).toBe('2024-10-11')
  })

  it('adds a legal completed backfill without changing any later record', () => {
    const later = period('later', '2024-10-12', null)
    const periods = [later]
    const created = addCompletedPeriod(periods, '2024-06-21', '2024-10-11', '2024-10-12')

    expect(created.ok).toBe(true)
    if (created.ok) {
      expect(created.record).toMatchObject({ startDate: '2024-06-21', endDate: '2024-10-11' })
      expect(created.periods.find((item) => item.id === later.id)).toBe(later)
      expect(created.periods).toHaveLength(2)
    }
    expect(periods).toEqual([later])
  })

  it('rejects a backfill whose end date overlaps a later record without changing existing data', () => {
    const later = period('later', '2024-10-12', null)
    const periods = [later]
    const created = addCompletedPeriod(periods, '2024-06-21', '2024-10-12', '2024-10-12')

    expect(created).toMatchObject({ ok: false, message: expect.stringContaining('重叠') })
    expect(periods).toEqual([later])
  })

  it('leaves the toggle unchanged until the user confirms a backfill', () => {
    const later = period('later', '2024-10-12', null)
    const periods = [later]
    const cancelledDialog = togglePeriodForDate(periods, '2024-06-21', true, '2024-10-12')

    expect(cancelledDialog).toMatchObject({ ok: true, changed: false, action: 'backfill-required' })
    expect(cancelledDialog.periods).toBe(periods)
    expect(periods).toEqual([later])
  })

  it('still starts an ongoing period directly when no later record conflicts', () => {
    const started = changed(togglePeriodForDate(saved, '2024-03-08', true, '2024-03-10'))
    expect(started.action).toBe('started')
    expect(started.record.startDate).toBe('2024-03-08')
    expect(started.record.endDate).toBeNull()
  })
})
