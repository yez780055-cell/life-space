import { describe, expect, it } from 'vitest';
import type { PeriodRecord } from '../types';
import { calculatePeriodStatistics } from './statistics';

function record(id: string, startDate: string, endDate: string | null): PeriodRecord {
  return { id, startDate, endDate, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };
}

describe('period statistics', () => {
  it('uses only actual starts and completed actual lengths', () => {
    const result = calculatePeriodStatistics([
      record('a', '2024-01-01', '2024-01-05'),
      record('b', '2024-01-29', '2024-02-01'),
      record('c', '2024-02-26', null)
    ]);
    expect(result.cycleIntervals).toEqual([28, 28]);
    expect(result.averageCycle).toBe(28);
    expect(result.completedLengths).toEqual([5, 4]);
    expect(result.averagePeriod).toBe(4.5);
  });

  it('uses at most the six most recent actual intervals and lengths', () => {
    const starts = ['2024-01-01', '2024-01-29', '2024-02-26', '2024-03-25', '2024-04-22', '2024-05-20', '2024-06-17', '2024-07-15'];
    const result = calculatePeriodStatistics(starts.map((start, index) => record(String(index), start, '2024-' + start.slice(5, 7) + '-' + String(Math.min(28, Number(start.slice(8)) + 4)).padStart(2, '0'))));
    expect(result.cycleIntervals).toHaveLength(6);
    expect(result.completedLengths).toHaveLength(6);
  });

  it('returns empty statistics when no actual records exist', () => {
    expect(calculatePeriodStatistics([])).toEqual({ cycleIntervals: [], completedLengths: [], averageCycle: null, averagePeriod: null });
  });
});
