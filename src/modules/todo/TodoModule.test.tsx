import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../../app/shell/App';
import { DB_NAME, resetDatabaseConnectionForTests } from '../../shared/storage/database';
import { addDays, todayKey } from './data/dates';
import { todoRepository } from './data/repository';
import { coupleRepository } from './couple/repository';

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
  }
}

function mockViewportRects() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList?.contains('module-holder') && this.classList.contains('visible')) return rect(0, 70, 390, 702);
    if (this.dataset?.spaceToggle) return rect(320, 88, 46, 46);
    return rect(0, 0, 320, 100);
  });
}

async function removeDatabase() {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function enterCouple() {
  fireEvent.click(screen.getByRole('button', { name: '进入情侣专区' }));
  await screen.findByRole('region', { name: '我们的小事' });
}

async function waitForTodoData() {
  await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-loading')).toBe('false'));
}

function coupleEditor() {
  const form = document.querySelector<HTMLFormElement>('.couple-editor-page');
  if (!form) throw new Error('情侣事项编辑页尚未打开。');
  return form;
}

function coupleCard(title: string) {
  const card = [...document.querySelectorAll<HTMLButtonElement>('.couple-card-body')]
    .find((button) => button.querySelector('strong')?.textContent === title);
  if (!card) throw new Error(`没有找到情侣事项卡片：${title}`);
  return card;
}

function expandCoupleCard(title: string) {
  const card = coupleCard(title);
  if (card.getAttribute('aria-expanded') !== 'true') fireEvent.click(card);
  return card;
}

beforeEach(async () => {
  await removeDatabase();
  history.replaceState(null, '');
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('minimal personal Todo', () => {
  it('opens on today, shows no demo tasks, and exposes only date and all views', async () => {
    render(<App/>);
    const page = await screen.findByRole('region', { name: '待办' });
    expect(within(page).getByRole('heading', { name: '今天' })).toBeTruthy();
    expect(within(page).getByRole('button', { name: '日期' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(page).getByRole('button', { name: '全部' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(page).getByText('这一天没有未完成的待办。')).toBeTruthy();
    expect(await todoRepository.listTasks()).toEqual([]);
    expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('personal');
  });

  it('quick-add focuses the title, uses the selected date, stays open for repeated entry, and rejects blank titles', async () => {
    const selected = addDays(todayKey(), 2);
    render(<App/>);
    await screen.findByRole('heading', { name: '今天' });
    fireEvent.click(screen.getByRole('button', { name: '后一天' }));
    fireEvent.click(screen.getByRole('button', { name: '后一天' }));
    expect(screen.getByRole('button', { name: '回到今天' })).toBeTruthy();

    const addTrigger = screen.getByRole('button', { name: '快速新增待办' });
    fireEvent.click(addTrigger);
    const dialog = await screen.findByRole('dialog', { name: '快速添加' });
    const title = within(dialog).getByRole('textbox', { name: '任务内容' }) as HTMLInputElement;
    expect(document.activeElement).toBe(title);
    expect(document.querySelector('.todo-module-root')?.hasAttribute('inert')).toBe(true);
    expect((within(dialog).getByLabelText('任务日期') as HTMLInputElement).value).toBe(selected);
    const submitButton = within(dialog).getByRole('button', { name: '添加' });
    expect(submitButton).toHaveProperty('disabled', true);
    fireEvent.change(title, { target: { value: '测试焦点环' } });
    expect(submitButton).toHaveProperty('disabled', false);
    const closeButton = dialog.querySelector('.todo-dialog-close') as HTMLButtonElement;
    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(submitButton);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
    title.focus();
    fireEvent.change(title, { target: { value: '  浇花  ' } });
    fireEvent.submit(dialog);
    await waitFor(async () => expect(await todoRepository.listTasks()).toHaveLength(1));
    expect((await todoRepository.listTasks())[0]).toMatchObject({ title: '浇花', scheduledDate: selected });
    expect(screen.getByRole('dialog', { name: '快速添加' })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('textbox', { name: '任务内容' }) as HTMLInputElement).value).toBe(''));

    fireEvent.change(screen.getByRole('textbox', { name: '任务内容' }), { target: { value: '收衣服' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    await waitFor(async () => expect(await todoRepository.listTasks()).toHaveLength(2));
    const addedTitles = (await todoRepository.listTasks()).map((task) => task.title);
    expect(addedTitles).toHaveLength(2);
    expect(addedTitles).toEqual(expect.arrayContaining(['浇花', '收衣服']));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '快速添加' })).toBeNull());
    expect(await screen.findByRole('button', { name: '完成任务：浇花' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(addTrigger));
  });

  it('keeps the selected date when switching to All and back, and returns to today', async () => {
    const target = addDays(todayKey(), 3);
    render(<App/>);
    await screen.findByRole('heading', { name: '今天' });
    fireEvent.click(screen.getByRole('button', { name: '后一天' }));
    fireEvent.click(screen.getByRole('button', { name: '后一天' }));
    fireEvent.click(screen.getByRole('button', { name: '后一天' }));
    await screen.findByRole('button', { name: '回到今天' });
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(screen.getByRole('heading', { name: '全部未完成' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '日期' }));
    fireEvent.click(screen.getByRole('button', { name: '快速新增待办' }));
    const dialog = await screen.findByRole('dialog', { name: '快速添加' });
    expect((within(dialog).getByLabelText('任务日期') as HTMLInputElement).value).toBe(target);
    fireEvent.click(within(dialog).getAllByRole('button', { name: '关闭' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '快速添加' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '回到今天' }));
    expect(screen.getByRole('heading', { name: '今天' })).toBeTruthy();
  });

  it('shows all one-off tasks grouped by date, including undated and past records, and folds completed records', async () => {
    const past = addDays(todayKey(), -2), future = addDays(todayKey(), 4);
    const completed = await todoRepository.createQuickTask('已完成旧任务', past);
    await todoRepository.createQuickTask('未来安排', future);
    await todoRepository.createQuickTask('没有日期');
    await todoRepository.setCompleted(completed.id, null, true);
    render(<App/>);
    await screen.findByRole('heading', { name: '今天' });
    await waitForTodoData();
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    await waitForTodoData();
    expect(await screen.findByRole('button', { name: '完成任务：未来安排' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '完成任务：没有日期' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '恢复任务：已完成旧任务' })).toBeNull();
    const completedToggle = document.querySelector('.todo-minimal-completed-toggle') as HTMLButtonElement;
    expect(completedToggle).toBeTruthy();
    expect(completedToggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(completedToggle);
    expect(await screen.findByRole('button', { name: '恢复任务：已完成旧任务' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '未设置日期' })).toBeTruthy();
  });

  it('moves a task to completed immediately, undoes only the selected completion, and persists both states', async () => {
    const first = await todoRepository.createQuickTask('整理书桌', todayKey());
    const second = await todoRepository.createQuickTask('回收纸箱', todayKey());
    render(<App/>);
    await screen.findByRole('button', { name: '完成任务：整理书桌' });
    fireEvent.click(screen.getByRole('button', { name: '完成任务：整理书桌' }));
    await screen.findByRole('button', { name: '撤销完成：整理书桌' });
    fireEvent.click(screen.getByRole('button', { name: '完成任务：回收纸箱' }));
    await screen.findByRole('button', { name: '撤销完成：回收纸箱' });
    await waitFor(async () => {
      expect((await todoRepository.listTasks()).find((task) => task.id === first.id)?.completedAt).toBeTypeOf('number');
      expect((await todoRepository.listTasks()).find((task) => task.id === second.id)?.completedAt).toBeTypeOf('number');
    });
    fireEvent.click(screen.getByRole('button', { name: '撤销完成：回收纸箱' }));
    await screen.findByRole('button', { name: '完成任务：回收纸箱' });
    await waitFor(async () => expect((await todoRepository.listTasks()).find((task) => task.id === second.id)?.completedAt).toBeNull());
    expect((await todoRepository.listTasks()).find((task) => task.id === first.id)?.completedAt).toBeTypeOf('number');
    fireEvent.click(document.querySelector('.todo-minimal-completed-toggle')!);
    expect(screen.getByRole('button', { name: '恢复任务：整理书桌' })).toBeTruthy();
  });

  it('edits title and date while preserving legacy notes, tags, subtasks, reminders, and completion metadata', async () => {
    const originalDate = todayKey();
    const task = await todoRepository.saveTask({
      title: '准备植物换盆', note: '先铺报纸', scheduledDate: originalDate, scheduledTime: '18:30',
      tags: ['家务'], subtasks: [{ id: 'soil', title: '买土', checked: false }], recurrence: null, recurrenceHistory: [],
      reminder: { enabled: true, minutesBefore: 20 }
    });
    render(<App/>);
    await screen.findByRole('button', { name: '编辑任务：准备植物换盆' });
    fireEvent.click(screen.getByRole('button', { name: '编辑任务：准备植物换盆' }));
    const editor = await screen.findByRole('dialog', { name: '编辑待办' });
    fireEvent.change(within(editor).getByRole('textbox', { name: '任务内容' }), { target: { value: '给绿萝换盆' } });
    const newDate = addDays(originalDate, 1);
    fireEvent.change(within(editor).getByLabelText('任务日期'), { target: { value: newDate } });
    fireEvent.click(within(editor).getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await todoRepository.listTasks()).find((record) => record.id === task.id)?.scheduledDate).toBe(newDate));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑待办' })).toBeNull());
    const saved = (await todoRepository.listTasks()).find((record) => record.id === task.id)!;
    expect(saved).toMatchObject({ title: '给绿萝换盆', note: '先铺报纸', scheduledTime: '18:30', tags: ['家务'], subtasks: [{ id: 'soil', title: '买土', checked: false }], reminder: { enabled: true, minutesBefore: 20 }, completedAt: null, recurrence: null });
    expect(await todoRepository.listTasks()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(await screen.findByRole('button', { name: '完成任务：给绿萝换盆' })).toBeTruthy();
  });

  it('asks before deleting a recurring series and removes its history only after confirmation', async () => {
    const start = todayKey();
    const historicalDate = addDays(start, -2);
    const task = await todoRepository.saveTask({
      title: '每日服药', note: '', scheduledDate: null, scheduledTime: null, tags: [], subtasks: [],
      recurrence: null, recurrenceHistory: [{ frequency: 'daily', interval: 1, startsOn: historicalDate, endsOn: addDays(start, -1), weekdays: [] }],
      reminder: { enabled: false, minutesBefore: 10 }
    });
    await todoRepository.setCompleted(task.id, historicalDate, true);
    render(<App/>);
    await screen.findByRole('heading', { name: '今天' });
    await waitForTodoData();
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    fireEvent.click(screen.getByRole('button', { name: /已完成/ }));
    const masterEdit = document.querySelector(`[data-task-key="${task.id}"] .todo-minimal-edit`);
    expect(masterEdit).toBeTruthy();
    fireEvent.click(masterEdit!);
    const editor = await screen.findByRole('dialog', { name: '编辑待办' });
    fireEvent.click(within(editor).getByRole('button', { name: '删除' }));
    expect(within(editor).getByText('这会删除整个重复任务系列和它的周期记录。')).toBeTruthy();
    expect((await todoRepository.listTasks())).toHaveLength(1);
    fireEvent.click(within(editor).getByRole('button', { name: '确认删除' }));
    await waitFor(async () => expect(await todoRepository.listTasks()).toHaveLength(0));
    expect(await todoRepository.listOccurrences()).toEqual([]);
  });

  it('persists real couple tasks, filters by OR tags, records and restores completion, and preserves personal data', async () => {
    const task = await todoRepository.createQuickTask('只属于个人的任务', todayKey());
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('button', { name: '完成任务：只属于个人的任务' });
    await waitForTodoData();
    await enterCouple();
    expect(screen.getByText('仅保存在此设备')).toBeTruthy();
    expect(screen.getByText('还没有安排好的事项。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '新增情侣事项' }));
    let dialog = await screen.findByRole('dialog', { name: '快速添加小事' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '事项标题' }), { target: { value: '一起散步' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '添加' }));
    await waitFor(async () => expect((await coupleRepository.listItems()).map((item) => item.title)).toContain('一起散步'));
    await waitFor(() => expect((within(dialog).getByRole('textbox', { name: '事项标题' }) as HTMLInputElement).value).toBe(''));
    fireEvent.click(within(dialog).getAllByRole('button', { name: '关闭' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '快速添加小事' })).toBeNull());

    fireEvent.click(coupleCard('一起散步'));
    fireEvent.click(screen.getByRole('button', { name: '编辑：一起散步' }));
    let editor = coupleEditor();
    fireEvent.change(within(editor).getByRole('textbox', { name: '事项标题' }), { target: { value: '周末一起散步' } });
    fireEvent.change(within(editor).getByLabelText('安排日期'), { target: { value: todayKey() } });
    fireEvent.change(within(editor).getByLabelText('安排时间'), { target: { value: '18:30' } });
    fireEvent.change(within(editor).getByRole('textbox', { name: '备注' }), { target: { value: '带上相机' } });
    fireEvent.change(within(editor).getByRole('textbox', { name: '新建情侣标签' }), { target: { value: '周末' } });
    fireEvent.click(within(editor).getByRole('button', { name: '添加标签' }));
    expect(await within(editor).findByRole('button', { name: '周末' })).toBeTruthy();
    fireEvent.click(within(editor).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(coupleCard('周末一起散步')).toBeTruthy());
    await waitFor(async () => expect(await coupleRepository.listItems()).toEqual([expect.objectContaining({ title: '周末一起散步', scheduledDate: todayKey(), scheduledTime: '18:30', note: '带上相机', tags: [expect.any(String)] })]));

    fireEvent.click(screen.getByRole('button', { name: '新增情侣事项' }));
    dialog = await screen.findByRole('dialog', { name: '快速添加小事' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '事项标题' }), { target: { value: '在家看电影' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '详细' }));
    expect((within(dialog).getByRole('textbox', { name: '事项标题' }) as HTMLInputElement).value).toBe('在家看电影');
    fireEvent.change(within(dialog).getByLabelText('安排日期'), { target: { value: todayKey() } });
    fireEvent.change(within(dialog).getByLabelText('时间（可选）'), { target: { value: '20:00' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '备注' }), { target: { value: '选一部喜欢的电影' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '新建情侣标签' }), { target: { value: '居家' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '添加标签' }));
    expect(await within(dialog).findByRole('button', { name: '居家' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '添加' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '详细添加小事' })).toBeNull());
    await waitFor(async () => expect(await coupleRepository.listItems()).toEqual(expect.arrayContaining([expect.objectContaining({ title: '在家看电影', scheduledDate: todayKey(), scheduledTime: '20:00', note: '选一部喜欢的电影', tags: [expect.any(String)] })])));
    expect(coupleCard('在家看电影')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '周末' }));
    await waitFor(() => expect(document.querySelectorAll('.couple-card-body')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '居家' }));
    await waitFor(() => expect(document.querySelectorAll('.couple-card-body')).toHaveLength(2));

    let secondCard = coupleCard('在家看电影');
    const plannedColumn = screen.getByRole('region', { name: '已安排' });
    const unplannedColumn = screen.getByRole('region', { name: '未安排' });
    fireEvent.click(secondCard);
    expect(secondCard.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(secondCard);
    expect(secondCard.getAttribute('aria-expanded')).toBe('false');

    fireEvent.pointerDown(secondCard, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(unplannedColumn, { pointerId: 7, clientX: 3, clientY: 3 });
    fireEvent.pointerUp(unplannedColumn, { pointerId: 7, clientX: 3, clientY: 3 });
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '在家看电影')?.scheduledDate).toBe(todayKey()));
    fireEvent.pointerDown(secondCard, { pointerId: 8, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(unplannedColumn, { pointerId: 8, clientX: 12, clientY: 12 });
    fireEvent.pointerUp(unplannedColumn, { pointerId: 8, clientX: 12, clientY: 12 });
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '在家看电影')?.scheduledDate).toBeNull());
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '在家看电影')?.scheduledTime).toBeNull());
    secondCard = coupleCard('在家看电影');

    fireEvent.pointerDown(secondCard, { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(plannedColumn, { pointerId: 9, clientX: 3, clientY: 3 });
    fireEvent.pointerUp(plannedColumn, { pointerId: 9, clientX: 3, clientY: 3 });
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '在家看电影')?.scheduledDate).toBeNull());
    fireEvent.pointerDown(secondCard, { pointerId: 10, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(plannedColumn, { pointerId: 10, clientX: 12, clientY: 12 });
    fireEvent.pointerUp(plannedColumn, { pointerId: 10, clientX: 12, clientY: 12 });
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '在家看电影')?.scheduledDate).toBe(todayKey()));
    secondCard = coupleCard('在家看电影');

    fireEvent.pointerDown(secondCard, { pointerId: 11, pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(document.body, { pointerId: 11, pointerType: 'touch', clientX: 12, clientY: 34 });
    fireEvent.pointerUp(document.body, { pointerId: 11, pointerType: 'touch', clientX: 12, clientY: 34 });
    fireEvent.click(secondCard);
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '在家看电影')?.scheduledDate).toBe(todayKey()));
    expect(secondCard.getAttribute('aria-expanded')).toBe('false');

    // Pointer-up may reparent this card into the other column; query its live node before the next gesture.
    secondCard = coupleCard('在家看电影');
    expect(secondCard.isConnected).toBe(true);
    vi.useFakeTimers();
    fireEvent.pointerDown(secondCard, { pointerId: 12, pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(299));
    expect(secondCard.closest('.couple-item-card')?.classList.contains('is-dragging')).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(secondCard.closest('.couple-item-card')?.classList.contains('is-dragging')).toBe(true);
    fireEvent.pointerMove(unplannedColumn, { pointerId: 12, pointerType: 'touch', clientX: 12, clientY: 12 });
    fireEvent.pointerUp(unplannedColumn, { pointerId: 12, pointerType: 'touch', clientX: 12, clientY: 12 });
    act(() => vi.advanceTimersByTime(0));
    vi.useRealTimers();
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '在家看电影')?.scheduledDate).toBeNull());
    expect(secondCard.getAttribute('aria-expanded')).toBe('false');

    expandCoupleCard('周末一起散步');
    fireEvent.click(screen.getByRole('button', { name: '完成：周末一起散步' }));
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '周末一起散步')?.completedAt).toEqual(expect.any(Number)));
    fireEvent.click(await screen.findByRole('button', { name: '撤销完成：周末一起散步' }));
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '周末一起散步')?.completedAt).toBeNull());
    await waitFor(() => expect(coupleCard('周末一起散步')).toBeTruthy());

    expandCoupleCard('周末一起散步');
    fireEvent.click(screen.getByRole('button', { name: '完成：周末一起散步' }));
    await waitFor(async () => expect((await coupleRepository.listItems()).find((item) => item.title === '周末一起散步')?.completedAt).toEqual(expect.any(Number)));
    fireEvent.click(screen.getByRole('button', { name: '查看已完成历史' }));
    expect(await screen.findByRole('heading', { name: '完成的时光' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '周末一起散步' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '筛选时间范围' }));
    const rangeDialog = await screen.findByRole('dialog', { name: '选择时间范围' });
    fireEvent.click(within(rangeDialog).getByRole('button', { name: '自定义时间段' }));
    fireEvent.change(within(rangeDialog).getByLabelText('开始日期'), { target: { value: todayKey() } });
    fireEvent.change(within(rangeDialog).getByLabelText('结束日期'), { target: { value: todayKey() } });
    fireEvent.click(within(rangeDialog).getByRole('button', { name: '完成' }));
    expect(await screen.findByRole('heading', { name: '周末一起散步' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '恢复到待办' }));
    expect(await screen.findByText('这个时间范围内没有已完成的事项。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    await screen.findByRole('button', { name: '返回个人待办' });
    fireEvent.click(coupleCard('在家看电影'));
    fireEvent.click(screen.getByRole('button', { name: '编辑：在家看电影' }));
    editor = coupleEditor();
    fireEvent.click(within(editor).getByRole('button', { name: '删除' }));
    expect(within(editor).getByRole('group', { name: '确认删除事项' })).toBeTruthy();
    fireEvent.click(within(editor).getByRole('button', { name: '取消删除' }));
    expect((await coupleRepository.listItems()).map((item) => item.title)).toContain('在家看电影');
    fireEvent.click(within(editor).getByRole('button', { name: '删除' }));
    fireEvent.click(within(editor).getByRole('button', { name: '确认删除' }));
    await waitFor(async () => expect((await coupleRepository.listItems()).map((item) => item.title)).not.toContain('在家看电影'));

    expect(await screen.findByRole('button', { name: '返回个人待办' })).toBeTruthy();
    expect((await todoRepository.listTasks()).map((record) => record.id)).toEqual([task.id]);
    fireEvent.click(screen.getByRole('button', { name: '返回个人待办' }));
    expect(await screen.findByRole('button', { name: '完成任务：只属于个人的任务' })).toBeTruthy();
  }, 15000);

  it('keeps Period, Anniversary, and Settings navigation available', async () => {
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    const mainNavigation = screen.getAllByRole('navigation', { name: '主要导航' }).at(-1)!;
    fireEvent.click(within(mainNavigation).getByRole('button', { name: '小月历' }));
    await screen.findByRole('region', { name: '小月历' });
    fireEvent.click(within(mainNavigation).getByRole('button', { name: '纪念日' }));
    await screen.findByRole('region', { name: '纪念日' });
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(await screen.findByRole('region', { name: '设置' })).toBeTruthy();
  });
});
