import type { DateKey } from './model';

const pad = (value: number) => String(value).padStart(2, '0');

export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DateKey;
}

/** Parse a local calendar date without routing it through UTC. */
export function fromDateKey(key: DateKey | string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: DateKey, amount: number): DateKey {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function todayKey(now = new Date()): DateKey {
  return toDateKey(now);
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function startOfWeek(key: DateKey): DateKey {
  const date = fromDateKey(key);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return toDateKey(date);
}

export function endOfWeek(key: DateKey): DateKey {
  return addDays(startOfWeek(key), 6);
}

export function weekKeys(key: DateKey): DateKey[] {
  const monday = startOfWeek(key);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function monthKey(key: DateKey): string {
  return key.slice(0, 7);
}

export function shiftMonth(key: DateKey, delta: number): DateKey {
  const date = fromDateKey(key);
  date.setDate(1);
  date.setMonth(date.getMonth() + delta);
  return toDateKey(date);
}

export function daysInMonth(key: DateKey): number {
  const date = fromDateKey(key);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function monthGridKeys(key: DateKey): (DateKey | null)[] {
  const date = fromDateKey(key);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = daysInMonth(key);
  const total = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? toDateKey(new Date(date.getFullYear(), date.getMonth(), day)) : null;
  });
}

export function localDateTime(dateKey: DateKey, time: string): Date {
  const [hour, minute] = time.split(':').map(Number);
  const date = fromDateKey(dateKey);
  date.setHours(hour, minute, 0, 0);
  return date;
}
