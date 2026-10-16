const DAY_MS = 24 * 60 * 60 * 1000

export function localDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / DAY_MS)
}

export function addDays(value: string, amount: number): string {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + amount)
  return localDateString(date)
}

export function monthKey(value: string): string {
  return value.slice(0, 7)
}

export function monthTitle(value: string): string {
  const date = parseLocalDate(`${monthKey(value)}-01`)
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

export function formatDate(value: string, includeYear = true): string {
  if (!isValidDateString(value)) return '日期无效'
  const date = parseLocalDate(value)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return includeYear ? `${date.getFullYear()}年${month}月${day}日` : `${month}月${day}日`
}

export function formatShortRange(start: string, end: string | null): string {
  if (!end) return `${formatDate(start)} 起`
  const startDate = parseLocalDate(start)
  const endDate = parseLocalDate(end)
  if (startDate.getFullYear() !== endDate.getFullYear()) return `${formatDate(start)} – ${formatDate(end)}`
  if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.getMonth() + 1}月${startDate.getDate()}日 – ${endDate.getDate()}日`
  }
  return `${formatDate(start, false)} – ${formatDate(end, false)}`
}

export function daysInPeriod(start: string, end: string): number {
  return daysBetween(start, end) + 1
}

export function weekdayLabel(value: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseLocalDate(value).getDay()]
}

export function monthGrid(value: string): string[] {
  const date = parseLocalDate(`${monthKey(value)}-01`)
  const year = date.getFullYear()
  const month = date.getMonth()
  const offset = new Date(year, month, 1).getDay()
  const count = new Date(year, month + 1, 0).getDate()
  const cells = Math.ceil((offset + count) / 7) * 7
  return Array.from({ length: cells }, (_, index) => {
    const day = index - offset + 1
    const cell = new Date(year, month, day, 12)
    return localDateString(cell)
  })
}

export function sameMonth(a: string, b: string): boolean {
  return monthKey(a) === monthKey(b)
}

export function shiftMonth(value: string, amount: number): string {
  const date = parseLocalDate(`${monthKey(value)}-01`)
  date.setMonth(date.getMonth() + amount)
  return localDateString(date)
}
