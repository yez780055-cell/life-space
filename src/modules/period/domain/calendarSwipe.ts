// Return +1 for next month (left swipe), -1 for previous month (right swipe).
export function getCalendarSwipeDirection(deltaX: number, deltaY: number, elapsedMs: number): -1 | 0 | 1 {
  if (elapsedMs < 0 || elapsedMs > 1000) return 0
  if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return 0
  return deltaX < 0 ? 1 : -1
}
