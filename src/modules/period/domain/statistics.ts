import type { PeriodRecord } from '../types';
import { daysBetween } from './date';
import { completedPeriodLength, sortPeriods } from './periods';

export interface PeriodStatistics {
  cycleIntervals: number[];
  completedLengths: number[];
  averageCycle: number | null;
  averagePeriod: number | null;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function calculatePeriodStatistics(periods: PeriodRecord[]): PeriodStatistics {
  const sorted = sortPeriods(periods);
  const starts = sorted.map((period) => period.startDate);
  const cycleIntervals = starts.slice(1)
    .map((date, index) => daysBetween(starts[index], date))
    .filter((days) => days > 0)
    .slice(-6);
  const completedLengths = sorted
    .map(completedPeriodLength)
    .filter((length): length is number => length !== null)
    .slice(-6);
  return {
    cycleIntervals,
    completedLengths,
    averageCycle: average(cycleIntervals),
    averagePeriod: average(completedLengths)
  };
}
