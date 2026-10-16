import type { DateKey } from '../data/model';

export type CoupleTag = {
  id: string;
  name: string;
  normalizedName: string;
  color: string | null;
  createdAt: number;
};

export type CoupleItem = {
  id: string;
  title: string;
  scheduledDate: DateKey | null;
  scheduledTime: string | null;
  /** IDs from the couple-only tag store; never references personal todoTags. */
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  /** Monotonic local revision; the future remote adapter uses the same field for optimistic concurrency. */
  revision: number;
};

export type CoupleItemDraft = Pick<CoupleItem, 'title' | 'scheduledDate' | 'scheduledTime' | 'tags' | 'note'> & {
  id?: string;
  expectedRevision?: number;
};

/** Storage adapter contract. The active implementation stays local until authenticated sync is configured. */
export interface CoupleTodoRepository {
  listItems(): Promise<CoupleItem[]>;
  listTags(): Promise<CoupleTag[]>;
  saveItem(draft: CoupleItemDraft): Promise<CoupleItem>;
  createQuickItem(title: string): Promise<CoupleItem>;
  setCompleted(itemId: string, completedAt: number | null, expectedRevision?: number): Promise<CoupleItem>;
  deleteItem(itemId: string, expectedRevision?: number): Promise<void>;
  upsertTag(value: string): Promise<CoupleTag>;
  deleteTag(tagId: string): Promise<void>;
}

export type CoupleHistoryRange =
  | { kind: 'preset'; days: 7 | 30 | 90 | 180 | 365 }
  | { kind: 'custom'; start: DateKey; end: DateKey };

export const DEFAULT_COUPLE_HISTORY_RANGE: CoupleHistoryRange = { kind: 'preset', days: 30 };

export function normalizeCoupleTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function validateDateKey(value: string): value is DateKey {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validateCoupleItemDraft(draft: CoupleItemDraft): string | null {
  if (!draft.title.trim()) return '请填写事项标题。';
  if (draft.title.trim().length > 500) return '标题不能超过 500 个字符。';
  if (draft.scheduledDate && !validateDateKey(draft.scheduledDate)) return '请选择有效的安排日期。';
  if (draft.scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.scheduledTime)) return '请选择有效的安排时间。';
  if (draft.scheduledTime && !draft.scheduledDate) return '安排时间需要先选择日期。';
  if (draft.note.length > 5000) return '备注不能超过 5000 个字符。';
  return null;
}
