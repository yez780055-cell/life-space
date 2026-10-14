import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../../app/shell/App';
import { DB_NAME, resetDatabaseConnectionForTests } from '../../shared/storage/database';
import { addDays, fromDateKey, todayKey } from './data/dates';
import { todoRepository } from './data/repository';

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
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
  const ripple = await screen.findByTestId('space-ripple');
  fireEvent.animationEnd(ripple);
  await screen.findByRole('region', { name: '我们的小事' });
}

beforeEach(async () => {
  await removeDatabase();
  history.replaceState(null, '');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Todo Phase 2B', () => {
  it('opens on an empty personal week and does not insert demo tasks', async () => {
    render(<App/>);
    const page = await screen.findByRole('region', { name: '待办' });
    expect(within(page).getByRole('tab', { name: '本周' }).getAttribute('aria-selected')).toBe('true');
    expect(within(page).getByRole('heading', { name: '这一周' })).toBeTruthy();
    expect(within(page).getByText('这一周还没有安排任务。')).toBeTruthy();
    expect(await todoRepository.listTasks()).toEqual([]);
    expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('personal');
  });

  it('saves quick capture to IndexedDB and keeps the inbox task after reload', async () => {
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-loading')).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: '快速新增待办' }));
    const dialog = await screen.findByRole('dialog', { name: '快速记录' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '任务标题' }), { target: { value: '  买洗衣液  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    expect((await todoRepository.listTasks())[0].title).toBe('买洗衣液');
    expect(await screen.findByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /收集箱/ }));
    expect(await screen.findByText('买洗衣液')).toBeTruthy();
    cleanup();
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('button', { name: /收集箱/ }));
    expect(await screen.findByText('买洗衣液')).toBeTruthy();
  });

  it('moves a real inbox task to a date, saves details, and edits the same stored entity', async () => {
    await todoRepository.createQuickTask('买洗衣液');
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('button', { name: /收集箱/ }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：买洗衣液' }));
    await screen.findByRole('heading', { name: '编辑任务' });
    const targetDate = addDays(todayKey(), 2);
    fireEvent.change(screen.getByLabelText('任务日期'), { target: { value: targetDate } });
    fireEvent.change(screen.getByLabelText('具体时间'), { target: { value: '19:30' } });
    fireEvent.click(screen.getByText('更多设置'));
    fireEvent.change(screen.getByRole('textbox', { name: '备注' }), { target: { value: '买无香型补充装' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '编辑任务' })).toBeNull());
    const saved = (await todoRepository.listTasks())[0];
    expect(saved.scheduledDate).toBe(targetDate);
    expect(saved.scheduledTime).toBe('19:30');
    expect(saved.note).toBe('买无香型补充装');
    expect((await todoRepository.listTasks())).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: '本周' }));
    expect(await screen.findByRole('button', { name: '编辑任务：买洗衣液' })).toBeTruthy();
  });

  it('persists completion and hides completed tasks without deleting them', async () => {
    const task = await todoRepository.saveTask({
      title: '整理书桌', note: '', scheduledDate: todayKey(), scheduledTime: null, tags: [], subtasks: [], recurrence: null,
      recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 }
    });
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('tab', { name: '今天' }));
    fireEvent.click(await screen.findByRole('button', { name: '完成任务：整理书桌' }));
    await waitFor(async () => expect((await todoRepository.listTasks()).find((item) => item.id === task.id)?.completedAt).toBeTypeOf('number'));
    expect(await screen.findByRole('button', { name: '恢复任务：整理书桌' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '隐藏已完成' }));
    expect(screen.queryByRole('button', { name: '恢复任务：整理书桌' })).toBeNull();
    expect((await todoRepository.listTasks())).toHaveLength(1);
  });

  it('shows actionable subtasks in task rows and preserves automatic versus manual completion', async () => {
    const autoTask = await todoRepository.saveTask({
      title: '收拾厨房', note: '', scheduledDate: todayKey(), scheduledTime: null, tags: [],
      subtasks: [{ id: 'auto-a', title: '清理台面', checked: false }, { id: 'auto-b', title: '擦灶台', checked: false }],
      recurrence: null, recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 }
    });
    const manualTask = await todoRepository.saveTask({
      title: '浇花', note: '', scheduledDate: todayKey(), scheduledTime: null, tags: [],
      subtasks: [{ id: 'manual-a', title: '给绿萝浇水', checked: false }],
      recurrence: null, recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 }
    });
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    fireEvent.click(await screen.findByRole('checkbox', { name: '子任务：清理台面' }));
    await waitFor(() => expect((screen.getByRole('checkbox', { name: '子任务：清理台面' }) as HTMLInputElement).checked).toBe(true));
    fireEvent.click(screen.getByRole('checkbox', { name: '子任务：擦灶台' }));
    await waitFor(async () => {
      const saved = (await todoRepository.listTasks()).find((item) => item.id === autoTask.id);
      expect(saved?.completionSource).toBe('subtasks');
      expect(saved?.completedAt).toBeTypeOf('number');
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '子任务：清理台面' }));
    await waitFor(async () => {
      const saved = (await todoRepository.listTasks()).find((item) => item.id === autoTask.id);
      expect(saved?.completionSource).toBeNull();
      expect(saved?.completedAt).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: '完成任务：浇花' }));
    await waitFor(async () => expect((await todoRepository.listTasks()).find((item) => item.id === manualTask.id)?.completionSource).toBe('manual'));
    fireEvent.click(screen.getByRole('checkbox', { name: '子任务：给绿萝浇水' }));
    await waitFor(() => expect((screen.getByRole('checkbox', { name: '子任务：给绿萝浇水' }) as HTMLInputElement).checked).toBe(true));
    fireEvent.click(screen.getByRole('checkbox', { name: '子任务：给绿萝浇水' }));
    await waitFor(async () => {
      const saved = (await todoRepository.listTasks()).find((item) => item.id === manualTask.id);
      expect(saved?.completionSource).toBe('manual');
      expect(saved?.completedAt).toBeTypeOf('number');
    });
  });

  it('adds, renames, and deletes draft subtasks in the task editor', async () => {
    await todoRepository.createQuickTask('准备周末出门');
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('button', { name: /收集箱/ }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：准备周末出门' }));
    fireEvent.click(screen.getByRole('button', { name: /添加子任务/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '子任务标题' }), { target: { value: '带上外套' } });
    expect(screen.getByRole('button', { name: '删除子任务：带上外套' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '删除子任务：带上外套' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑任务' })).toBeNull());
    expect((await todoRepository.listTasks())[0].subtasks).toEqual([]);
  });

  it('keeps the editor draft open when IndexedDB saving fails', async () => {
    await todoRepository.createQuickTask('草稿任务');
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('button', { name: /收集箱/ }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：草稿任务' }));
    const title = await screen.findByRole('textbox', { name: '任务标题' });
    fireEvent.change(title, { target: { value: '已修改的草稿' } });
    vi.spyOn(todoRepository, 'saveTask').mockRejectedValueOnce(new Error('本机存储暂不可用'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect((await screen.findByRole('status')).textContent).toContain('本机存储暂不可用');
    expect(screen.getByRole('dialog', { name: '编辑任务' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: '任务标题' }) as HTMLInputElement).value).toBe('已修改的草稿');
  });

  it('opens and closes a month date in place and creates a task for the selected date', async () => {
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('tab', { name: '本月' }));
    const date = addDays(todayKey(), 3);
    const dateObject = fromDateKey(date);
    const label = (dateObject.getMonth() + 1) + '月' + dateObject.getDate() + '日';
    const grid = screen.getByRole('grid');
    fireEvent.click(within(grid).getByRole('gridcell', { name: label }));
    await waitFor(() => expect(document.querySelector('.todo-calendar-day.is-focused-day')).toBeTruthy());
    expect(screen.getByText('日期聚焦')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '添加当天任务' }));
    const dialog = await screen.findByRole('dialog', { name: '快速记录' });
    expect(within(dialog).getByText(new RegExp('保存到'))).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('textbox', { name: '任务标题' }), { target: { value: '给花换盆' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await todoRepository.listTasks())[0].scheduledDate).toBe(date);
    expect(await screen.findByRole('button', { name: '编辑任务：给花换盆' })).toBeTruthy();
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(document.querySelector('.todo-calendar-day.is-focused-day')).toBeNull());
  });

  it('keeps the focused month page under the editor sheet and restores focus on Escape', async () => {
    await todoRepository.saveTask({
      title: '读几页书', note: '', scheduledDate: todayKey(), scheduledTime: null, tags: [], subtasks: [], recurrence: null,
      recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 }
    });
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('tab', { name: '本月' }));
    const today = fromDateKey(todayKey());
    const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日`;
    fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(todayLabel) }));
    const editorButton = await screen.findByRole('button', { name: '编辑任务：读几页书' });
    const focusedDate = document.querySelector('.todo-calendar')?.getAttribute('data-focused-date');
    fireEvent.click(editorButton);
    const editor = await screen.findByRole('dialog', { name: '编辑任务' });
    expect(document.querySelector('.todo-editor-overlay')).toBeTruthy();
    expect(document.querySelector('.todo-module-root')?.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.todo-calendar-day.is-focused-day')).toBeTruthy();
    expect(document.querySelector('.todo-calendar')?.getAttribute('data-focused-date')).toBe(focusedDate);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑任务' })).toBeNull());
    expect(document.querySelector('.todo-calendar-day.is-focused-day')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(editorButton));
    expect(editor.isConnected).toBe(false);
  });

  it('creates a daily series through the editor and stores it as a rule, not copied rows', async () => {
    const task = await todoRepository.saveTask({
      title: '服药', note: '', scheduledDate: todayKey(), scheduledTime: '08:30', tags: [], subtasks: [], recurrence: null,
      recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 }
    });
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('tab', { name: '今天' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：服药' }));
    expect((document.querySelector('.todo-editor-more') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(screen.getByText('更多设置'));
    const recurrence = await screen.findByRole('combobox', { name: '重复规则' });
    fireEvent.change(recurrence, { target: { value: 'daily' } });
    expect(document.querySelector('.todo-repeat-summary')?.textContent).toContain('每天');
    expect(document.querySelector('.todo-repeat-advanced')?.hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await todoRepository.listTasks()).find((item) => item.id === task.id)?.recurrence?.frequency).toBe('daily'));
    expect(await todoRepository.listOccurrences()).toHaveLength(0);
  });

  it('preselects an existing advanced weekly rule and keeps occurrence scope as the default', async () => {
    const today = todayKey();
    const weekday = fromDateKey(today).getDay();
    const task = await todoRepository.saveTask({
      title: '每周整理', note: '', scheduledDate: today, scheduledTime: null, tags: [], subtasks: [],
      recurrence: { frequency: 'weekly', interval: 2, startsOn: today, endsOn: addDays(today, 45), weekdays: [weekday, (weekday + 2) % 7] },
      recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 }
    });
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    fireEvent.click((await screen.findAllByRole('button', { name: '编辑任务：每周整理' }))[0]);
    expect((screen.getByRole('radio', { name: '仅此周期' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '此周期及之后' }));
    fireEvent.click(screen.getByText('更多设置'));
    expect((screen.getByRole('combobox', { name: '重复规则' }) as HTMLSelectElement).value).toBe('weekly');
    expect(screen.getByLabelText('重复间隔')).toHaveProperty('value', '2');
    expect(screen.getByText(/每 2 周/)).toBeTruthy();
    expect(document.querySelector('.todo-repeat-advanced')?.hasAttribute('open')).toBe(true);
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    for (const day of [weekday, (weekday + 2) % 7]) expect(screen.getByRole('button', { name: `周${names[day]}` }).getAttribute('aria-pressed')).toBe('true');
    expect((await todoRepository.listTasks()).find((item) => item.id === task.id)?.recurrence?.weekdays).toEqual([weekday, (weekday + 2) % 7]);
  });

  it('stops a recurring series from the selected cycle and keeps that cycle as a one-off task', async () => {
    await todoRepository.saveTask({
      title: '浇花', note: '', scheduledDate: todayKey(), scheduledTime: null, tags: [], subtasks: [],
      recurrence: { frequency: 'daily', interval: 1, startsOn: todayKey(), endsOn: null, weekdays: [] },
      recurrenceHistory: [], reminder: { enabled: false, minutesBefore: 10 }
    });
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('tab', { name: '今天' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：浇花' }));
    fireEvent.click(await screen.findByLabelText(/此周期及之后/));
    fireEvent.click(screen.getByText('更多设置'));
    fireEvent.change(screen.getByRole('combobox', { name: '重复规则' }), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByRole('button', { name: '编辑任务：浇花' });
    const saved = (await todoRepository.listTasks())[0];
    expect(saved.recurrence).toBeNull();
    expect(saved.recurrenceHistory).toHaveLength(0);
    expect((await todoRepository.listOccurrences())).toHaveLength(0);
  });

  it('asks before discarding an unsaved editor when the browser Back button is used', async () => {
    await todoRepository.createQuickTask('暂存任务');
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('button', { name: /收集箱/ }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：暂存任务' }));
    fireEvent.change(await screen.findByLabelText('备注'), { target: { value: '还没保存' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    expect(screen.getByRole('heading', { name: '编辑任务' })).toBeTruthy();
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockReturnValue(true);
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(screen.queryByRole('heading', { name: '编辑任务' })).toBeNull());
    expect((await todoRepository.listTasks())[0].note).toBe('');
  });

  it('uses an explicit click to request notification permission and preserves the two-space demo', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    await enterCouple();
    const firstCard = screen.getByRole('button', { name: /找一家喜欢的日料店/ });
    fireEvent.click(firstCard);
    expect(firstCard.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '编辑：找一家喜欢的日料店' }));
    await screen.findByRole('heading', { name: '编辑小事' });
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await screen.findByRole('region', { name: '我们的小事' });
    expect(screen.getByRole('button', { name: '返回个人待办' })).toBeTruthy();
  });

  it('keeps space ripple focus restoration and blocks rapid duplicate transitions', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    const sun = screen.getByRole('button', { name: '进入情侣专区' });
    fireEvent.click(sun);
    const ripple = screen.getByTestId('space-ripple');
    expect(ripple.getAttribute('data-target-space')).toBe('couple');
    expect(ripple.style.getPropertyValue('--ripple-x')).toBe('343px');
    fireEvent.click(sun);
    fireEvent.animationEnd(ripple);
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('couple'));
    await waitFor(() => expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).toBe('返回个人待办'));
    expect(screen.queryByTestId('space-ripple')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回个人待办' }));
    const reverse = screen.getByTestId('space-ripple');
    fireEvent.animationEnd(reverse);
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('personal'));
  });

  it('closes quick capture before returning through historical and space layers', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('button', { name: '快速新增待办' }));
    await screen.findByRole('dialog', { name: '快速记录' });
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await enterCouple();
    fireEvent.click(screen.getByRole('button', { name: '查看已完成历史' }));
    await screen.findByRole('heading', { name: '完成的时光' });
    fireEvent.click(screen.getByRole('button', { name: '筛选时间范围' }));
    await screen.findByRole('dialog', { name: '选择时间范围' });
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { name: '完成的时光' })).toBeTruthy();
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await screen.findByRole('region', { name: '我们的小事' });
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('personal'));
  });

  it('respects reduced motion and keeps global module tabs outside Todo history', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    const rootHistoryLength = history.length;
    fireEvent.click(screen.getByRole('tab', { name: '今天' }));
    fireEvent.click(screen.getByRole('tab', { name: '本月' }));
    expect(history.length).toBe(rootHistoryLength);
    const tabs = screen.getAllByRole('navigation', { name: '主要导航' })[0];
    fireEvent.click(tabs.querySelectorAll('button')[1]);
    await screen.findByRole('region', { name: '小月历' });
    fireEvent.click(tabs.querySelectorAll('button')[2]);
    await screen.findByRole('region', { name: '纪念日' });
    fireEvent.click(tabs.querySelectorAll('button')[0]);
    await screen.findByRole('region', { name: '待办' });
    expect(history.length).toBe(rootHistoryLength);
  });
});
