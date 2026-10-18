export type DateKey = `${number}-${number}-${number}`;
export type CompletionSource = 'manual';
export type RepeatFrequency = 'daily' | 'weekly' | 'monthly';

export type RecurrenceRule = {
  frequency: RepeatFrequency;
  interval: number;
  startsOn: DateKey;
  endsOn: DateKey | null;
  /** JavaScript weekday values: Sunday 0 through Saturday 6. */
  weekdays: number[];
};

export type ReminderSettings = {
  enabled: boolean;
  minutesBefore: number;
};

export type PersonalTag = { id: string; name: string; normalizedName: string; color: string | null; createdAt: number };

export type PersonalTask = {
  id: string;
  title: string;
  note: string;
  scheduledDate: DateKey | null;
  scheduledTime: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  completionSource: CompletionSource | null;
  recurrence: RecurrenceRule | null;
  /** Previous non-overlapping rule versions; keeps completed cycles readable after series edits. */
  recurrenceHistory: RecurrenceRule[];
  /** The stable task ID doubles as its series ID for recurring templates. */
  seriesId: string | null;
  reminder: ReminderSettings;
};

export type TaskOverride = Partial<Pick<PersonalTask,
  'title' | 'note' | 'scheduledDate' | 'scheduledTime' | 'tags' | 'reminder'
>>;

export type TaskOccurrence = {
  /** Stable compound key: `${taskId}:${periodDate}`. */
  key: string;
  taskId: string;
  periodDate: DateKey;
  /** Effective date for one-occurrence rescheduling. */
  scheduledDate: DateKey;
  completedAt: number | null;
  completionSource: CompletionSource | null;
  override: TaskOverride;
  skipped: boolean;
  updatedAt: number;
};

export type TaskInstance = {
  instanceKey: string;
  taskId: string;
  periodDate: DateKey | null;
  title: string;
  note: string;
  scheduledDate: DateKey | null;
  scheduledTime: string | null;
  tags: string[];
  completedAt: number | null;
  completionSource: CompletionSource | null;
  recurrence: RecurrenceRule | null;
  reminder: ReminderSettings;
  createdAt: number;
  updatedAt: number;
};

export type TaskDraft = Omit<PersonalTask, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'completionSource' | 'seriesId' | 'recurrenceHistory'> & { id?: string; recurrenceHistory?: RecurrenceRule[] };

export function occurrenceKey(taskId: string, periodDate: DateKey): string {
  return `${taskId}:${periodDate}`;
}

export function validateTaskDraft(draft: Pick<TaskDraft, 'title' | 'scheduledDate' | 'scheduledTime' | 'recurrence' | 'reminder'>): string | null {
  if (!draft.title.trim()) return '请先填写任务标题。';
  if (draft.scheduledTime && !draft.scheduledDate) return '具体时间需要先选择日期。';
  if (draft.recurrence && !draft.scheduledDate) return '重复任务需要设置开始日期。';
  if (draft.recurrence && draft.recurrence.interval < 1) return '重复间隔至少为 1。';
  if (draft.recurrence?.endsOn && draft.recurrence.endsOn < draft.recurrence.startsOn) return '重复结束日期不能早于开始日期。';
  if (draft.recurrence?.frequency === 'weekly' && !draft.recurrence.weekdays.length) return '每周重复至少选择一个星期。';
  if (draft.reminder.enabled && (!draft.scheduledDate || !draft.scheduledTime)) return '提醒需要同时设置日期和具体时间。';
  return null;
}
