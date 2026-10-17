import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { initialSnapshot } from '../../app/navigation/model';
import { addCalendarDays, formatDateKey, localTodayKey } from './domain/date';
import { MAX_MILESTONE_DAY } from './domain/milestones';
import type { AnniversaryRecord } from './types';
import { AnniversaryModule } from './AnniversaryModule';

const { listAnniversaries, createAnniversary, updateAnniversary } = vi.hoisted(() => ({ listAnniversaries: vi.fn(), createAnniversary: vi.fn(), updateAnniversary: vi.fn() }));
vi.mock('./data/repository', () => ({
  listAnniversaries,
  createAnniversary,
  updateAnniversary,
  deleteAnniversary: vi.fn(),
}));

beforeEach(() => { listAnniversaries.mockResolvedValue([]); });
afterEach(cleanup);

function record(date: string, milestoneDays: number[], milestoneEnabled = true): AnniversaryRecord {
  return { id: 'test-anniversary', title: '合成纪念日', date, recurrence: 'yearly', note: '', milestoneEnabled, milestoneDays, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };
}

describe('Anniversary module UI', () => {
  it('shows a real empty state without demo records and exposes the create route', async () => {
    const onScreen = vi.fn();
    render(<AnniversaryModule snapshot={initialSnapshot('anniversary')} active onScreen={onScreen} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    await screen.findByRole('heading', { name: '还没有纪念日' });
    expect(document.querySelector('.anniversary-module')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /查看最近纪念日/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新建纪念日' }));
    expect(onScreen).toHaveBeenCalledWith('editor');
  });

  it('shows the nearest custom milestone as Hero, lists its anchor week, and opens the selected record detail', async () => {
    const today = localTodayKey();
    const milestoneRecord = { ...record(addCalendarDays(today, -10), [12, 14]), id: 'milestone-home', title: '首页节点主项', createdAt: '2026-01-01T00:00:00.000Z' };
    const yearlyDate = addCalendarDays(today, 5);
    const yearlyRecord: AnniversaryRecord = { ...record(yearlyDate, [] , false), id: 'yearly-home', title: '首页周年项', createdAt: '2026-01-02T00:00:00.000Z' };
    const onceRecord: AnniversaryRecord = { ...record(addCalendarDays(today, 6), [], false), id: 'once-home', recurrence: 'once', title: '第六天事项', createdAt: '2026-01-03T00:00:00.000Z' };
    const outsideRecord: AnniversaryRecord = { ...record(addCalendarDays(today, 8), [], false), id: 'outside-home', recurrence: 'once', title: '窗口外事项', createdAt: '2026-01-04T00:00:00.000Z' };
    listAnniversaries.mockResolvedValue([outsideRecord, onceRecord, yearlyRecord, milestoneRecord]);
    const onScreen = vi.fn();
    render(<AnniversaryModule snapshot={initialSnapshot('anniversary')} active onScreen={onScreen} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);

    const hero = await screen.findByRole('button', { name: '查看最近纪念日：首页节点主项' });
    expect(hero.textContent).not.toContain('天数节点');
    expect(hero.textContent).toContain('第 12 天');
    expect(hero.textContent).toContain(formatDateKey(addCalendarDays(today, 1)));
    expect(hero.textContent).toContain('还有1天');
    fireEvent.click(hero);
    expect(onScreen).toHaveBeenCalledWith('detail', milestoneRecord.id);
    const week = screen.getByRole('region', { name: '接下来这一周' });
    expect(week.querySelector('.anniversary-section-count')?.textContent).toBe('3');
    expect(week.textContent).toContain('第 14 天');
    expect(week.textContent).toContain('首页周年项');
    expect(week.textContent).toContain('首次纪念日');
    expect(week.textContent).toContain('第六天事项');
    expect(week.textContent).not.toContain('窗口外事项');
    expect(week.querySelector('.anniversary-week-range')?.textContent).toBe(`${formatDateKey(addCalendarDays(today, 1), { month: 'long', day: 'numeric' })} - ${formatDateKey(addCalendarDays(today, 7), { month: 'long', day: 'numeric' })}`);
    const milestoneEvent = screen.getByRole('button', { name: '查看期待事项：首页节点主项，第 14 天' });
    const yearlyEvent = screen.getByRole('button', { name: '查看期待事项：首页周年项，首次纪念日' });
    const onceEvent = screen.getByRole('button', { name: '查看期待事项：第六天事项，一次' });
    expect(milestoneEvent.querySelector('.anniversary-week-date')?.textContent).toContain(formatDateKey(addCalendarDays(today, 3)));
    expect(yearlyEvent.querySelector('.anniversary-week-date')).toBeNull();
    expect(onceEvent.querySelector('.anniversary-week-date')?.textContent).toContain(formatDateKey(addCalendarDays(today, 6)));
    const allRecords = screen.getByRole('region', { name: '全部纪念日' });
    expect(allRecords.querySelector('[aria-label="查看纪念日：首页周年项"] .anniversary-record-date')).toBeNull();
    expect(allRecords.querySelector('[aria-label="查看纪念日：第六天事项"] .anniversary-record-date')?.textContent).toContain(formatDateKey(addCalendarDays(today, 6)));
    fireEvent.click(screen.getByRole('button', { name: '查看期待事项：首页周年项，首次纪念日' }));
    expect(onScreen).toHaveBeenCalledWith('detail', yearlyRecord.id);
  });

  it.each([
    { recurrence: 'yearly' as const, expectedLabel: '首次纪念日' },
    { recurrence: 'once' as const, expectedLabel: '一次' }
  ])('always displays the event date and label in a $recurrence Hero', async ({ recurrence, expectedLabel }) => {
    const today = localTodayKey();
    const eventDate = addCalendarDays(today, 2);
    const singleEvent: AnniversaryRecord = { ...record(eventDate, [], false), id: `hero-${recurrence}`, recurrence, title: `${recurrence}首页事项` };
    listAnniversaries.mockResolvedValue([singleEvent]);
    render(<AnniversaryModule snapshot={initialSnapshot('anniversary')} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);

    const hero = await screen.findByRole('button', { name: `查看最近纪念日：${singleEvent.title}` });
    expect(hero.querySelector('.anniversary-hero-date')?.textContent).toContain(formatDateKey(eventDate));
    expect(hero.querySelector('.anniversary-event-label')?.textContent).toBe(expectedLabel);
    expect(hero.querySelector('.anniversary-countdown')?.textContent).toContain('还有2天');
  });

  it('keeps a single upcoming item as the only Hero without an empty week section', async () => {
    const today = localTodayKey();
    listAnniversaries.mockResolvedValue([{ ...record(addCalendarDays(today, 20), [], false), recurrence: 'once', title: '稍后的单次事项' }]);
    render(<AnniversaryModule snapshot={initialSnapshot('anniversary')} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    const hero = await screen.findByRole('button', { name: '查看最近纪念日：稍后的单次事项' });
    expect(hero.textContent).toContain('还有20天');
    expect(screen.queryByRole('region', { name: '接下来这一周' })).toBeNull();
  });

  it('defaults day milestones off, adds and removes nodes, ignores duplicates, and retains nodes when toggled off', async () => {
    const onBack = vi.fn();
    createAnniversary.mockResolvedValue(record(localTodayKey(), [500, 520, 1000]));
    render(<AnniversaryModule snapshot={{ ...initialSnapshot('anniversary'), anniversaryScreen: 'editor' }} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={onBack} onReturnHome={vi.fn()} onError={vi.fn()}/>);

    const toggle = screen.getByRole('checkbox', { name: '天数纪念' });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole('group', { name: '天数节点' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('group', { name: '天数节点' })).toBeTruthy();

    const input = screen.getByRole('spinbutton', { name: '添加天数节点' });
    for (const day of ['500', '520']) {
      fireEvent.change(input, { target: { value: day } });
      fireEvent.click(screen.getByRole('button', { name: '＋添加' }));
    }
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: '＋添加' }));
    expect(screen.getAllByRole('button', { name: '删除 500 天节点' })).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toContain('已添加');

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '＋添加' }));
    expect(screen.getByRole('alert').textContent).toContain('大于 0 的整数');
    fireEvent.change(input, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: '＋添加' }));
    expect(screen.getByRole('alert').textContent).toContain('整数');
    fireEvent.change(input, { target: { value: String(MAX_MILESTONE_DAY + 1) } });
    fireEvent.click(screen.getByRole('button', { name: '＋添加' }));
    expect(screen.getByRole('alert').textContent).toContain('不能超过');
    fireEvent.change(input, { target: { value: '1000' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: '删除 1000 天节点' })).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByRole('group', { name: '天数节点' })).toBeNull();
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    expect(screen.getAllByRole('button', { name: '删除 500 天节点' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '删除 520 天节点' }));
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: '合成纪念日' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(createAnniversary).toHaveBeenCalledWith(expect.objectContaining({ milestoneEnabled: true, milestoneDays: [500, 1000] }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it('loads milestone settings in an existing editor and preserves them on update', async () => {
    const existing = record(localTodayKey(), [500, 1000]);
    const onBack = vi.fn();
    listAnniversaries.mockResolvedValue([existing]);
    updateAnniversary.mockResolvedValue({ ...existing, milestoneDays: [1000] });
    render(<AnniversaryModule snapshot={{ ...initialSnapshot('anniversary'), anniversaryScreen: 'editor', anniversaryRecordId: existing.id }} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={onBack} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    await waitFor(() => expect((screen.getByRole('checkbox', { name: '天数纪念' }) as HTMLInputElement).checked).toBe(true));
    expect(screen.getByRole('button', { name: '删除 500 天节点' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '删除 500 天节点' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(updateAnniversary).toHaveBeenCalledWith(existing.id, expect.objectContaining({ milestoneEnabled: true, milestoneDays: [1000] }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it('shows inclusive current day, today node, next countdown and calculated node date in detail', async () => {
    const today = localTodayKey();
    const existing = record(today, [1, 500]);
    listAnniversaries.mockResolvedValue([existing]);
    render(<AnniversaryModule snapshot={{ ...initialSnapshot('anniversary'), anniversaryScreen: 'detail', anniversaryRecordId: existing.id }} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    expect(await screen.findByText('相伴第 1 天')).toBeTruthy();
    const milestoneEvent = document.querySelector('.anniversary-milestone-next');
    expect(milestoneEvent?.textContent).toContain('第 1 天');
    expect(milestoneEvent?.textContent).toContain('就是今天');
    expect(milestoneEvent?.textContent).toContain(formatDateKey(today));
  });

  it('shows the next-node countdown and its calculated date', async () => {
    const today = localTodayKey();
    const started = record(addCalendarDays(today, -12), [20, 30]);
    listAnniversaries.mockResolvedValue([started]);
    render(<AnniversaryModule snapshot={{ ...initialSnapshot('anniversary'), anniversaryScreen: 'detail', anniversaryRecordId: started.id }} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    expect(await screen.findByText('相伴第 13 天')).toBeTruthy();
    const milestoneEvent = document.querySelector('.anniversary-milestone-next');
    expect(milestoneEvent?.textContent).toContain('第 20 天');
    expect(milestoneEvent?.textContent).toContain('还有7天');
    expect(milestoneEvent?.textContent).toContain(formatDateKey(addCalendarDays(started.date, 19)));
  });

  it('marks every custom node complete when all have passed', async () => {
    const today = localTodayKey();
    const allDone = record(addCalendarDays(today, -10), [1, 2]);
    listAnniversaries.mockResolvedValue([allDone]);
    render(<AnniversaryModule snapshot={{ ...initialSnapshot('anniversary'), anniversaryScreen: 'detail', anniversaryRecordId: allDone.id }} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    expect(await screen.findByText(/相伴第 \d+ 天/)).toBeTruthy();
    expect(screen.getByText('已完成全部天数节点')).toBeTruthy();
  });

  it('does not show negative day counts before a future original date', async () => {
    const today = localTodayKey();
    const future = record(addCalendarDays(today, 1), [1]);
    listAnniversaries.mockResolvedValue([future]);
    render(<AnniversaryModule snapshot={{ ...initialSnapshot('anniversary'), anniversaryScreen: 'detail', anniversaryRecordId: future.id }} active onScreen={vi.fn()} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    expect(await screen.findByText('纪念日尚未开始')).toBeTruthy();
    expect(screen.queryByText(/相伴第 -/)).toBeNull();
    const milestoneEvent = document.querySelector('.anniversary-milestone-next');
    expect(milestoneEvent?.textContent).toContain('第 1 天');
    expect(milestoneEvent?.textContent).toContain('还有1天');
  });
});
