import { localDateTime } from './dates';
import type { TaskInstance } from './model';

export type ReminderSchedule = { key: string; firesAt: number; title: string; body: string };

/** Return only future reminders; missed reminders are deliberately not replayed after a reopen. */
export function reminderSchedule(task: TaskInstance, now = Date.now()): ReminderSchedule | null {
  if (!task.reminder.enabled || !task.scheduledDate || !task.scheduledTime || task.completedAt !== null) return null;
  const dueAt = localDateTime(task.scheduledDate, task.scheduledTime).getTime();
  const firesAt = dueAt - task.reminder.minutesBefore * 60_000;
  if (firesAt <= now) return null;
  return { key: task.instanceKey + ':' + firesAt, firesAt, title: task.title, body: task.note || '待办时间到了。' };
}
