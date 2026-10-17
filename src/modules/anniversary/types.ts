export type AnniversaryRecurrence = 'yearly' | 'once';
export type AnniversaryDate = string;

export interface AnniversaryRecord {
  id: string;
  title: string;
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
  date: AnniversaryDate;
  recurrence: AnniversaryRecurrence;
  note?: string;
  milestoneEnabled?: boolean;
  milestoneDays?: number[];
}
