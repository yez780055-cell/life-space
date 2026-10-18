import type { AnniversaryIconKey } from './icons';

export type AnniversaryRecurrence = 'yearly' | 'once';
export type AnniversaryDate = string;

export interface AnniversaryRecord {
  id: string;
  title: string;
  icon: AnniversaryIconKey;
  date: AnniversaryDate;
  recurrence: AnniversaryRecurrence;
  note?: string;
  milestoneEnabled: boolean;
  milestoneDays: number[];
  createdAt: string;
  updatedAt: string;
}

export interface AnniversaryDraft {
  title: string;
  icon?: AnniversaryIconKey;
  date: AnniversaryDate;
  recurrence: AnniversaryRecurrence;
  note?: string;
  milestoneEnabled?: boolean;
  milestoneDays?: number[];
}
