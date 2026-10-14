import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../../app/shell/App';
import { DB_NAME, resetDatabaseConnectionForTests } from '../../shared/storage/database';

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

beforeEach(async () => {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); });
  history.replaceState(null, '');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Todo Phase 2A', () => {
  it('opens on the personal space with this week selected', async () => {
    render(<App/>);
    const page = await screen.findByRole('region', { name: '待办' });
    expect(within(page).getByRole('tab', { name: '本周' }).getAttribute('aria-selected')).toBe('true');
    expect(within(page).getByRole('heading', { name: '这一周' })).toBeTruthy();
    expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('personal');
  });

  it('reveals both spaces from the measured sun/heart position and blocks repeat toggles', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    const sun = screen.getByRole('button', { name: '进入情侣专区' });
    fireEvent.click(sun);
    const ripple = screen.getByTestId('space-ripple');
    expect(ripple.getAttribute('data-target-space')).toBe('couple');
    expect(ripple.style.getPropertyValue('--ripple-x')).toBe('343px');
    expect(ripple.style.getPropertyValue('--ripple-y')).toBe('41px');
    fireEvent.click(sun);
    fireEvent.animationEnd(ripple);
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('couple'));
    await waitFor(() => expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).toBe('返回个人待办'));
    expect(screen.queryByTestId('space-ripple')).toBeNull();
    const heart = screen.getByRole('button', { name: '返回个人待办' });
    fireEvent.click(heart);
    const reverseRipple = screen.getByTestId('space-ripple');
    expect(reverseRipple.getAttribute('data-target-space')).toBe('personal');
    fireEvent.animationEnd(reverseRipple);
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('personal'));
    await waitFor(() => expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).toBe('进入情侣专区'));
    expect(screen.queryByTestId('space-ripple')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '完成任务：给绿植浇水' }));
    expect(screen.getByRole('button', { name: '恢复任务：给绿植浇水' })).toBeTruthy();
  });

  it('switches time views and expands the collection inline', async () => {
    render(<App/>);
    const page = await screen.findByRole('region', { name: '待办' });
    const rootDepth = (history.state as { depth: number }).depth;
    const rootLength = history.length;
    fireEvent.click(within(page).getByRole('tab', { name: '今天' }));
    expect(within(page).getByRole('tab', { name: '今天' }).getAttribute('aria-selected')).toBe('true');
    expect(within(page).getByRole('heading', { name: '今天' })).toBeTruthy();
    fireEvent.click(within(page).getByRole('tab', { name: '本月' }));
    const currentMonth = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date());
    expect(within(page).getByRole('grid', { name: currentMonth })).toBeTruthy();
    fireEvent.click(within(page).getByRole('tab', { name: '本周' }));
    const inbox = within(page).getByRole('button', { name: /收集箱/ });
    fireEvent.click(inbox);
    expect(inbox.getAttribute('aria-expanded')).toBe('true');
    expect(within(page).getByText('想到一件要买的小东西')).toBeTruthy();
    fireEvent.click(inbox);
    expect(within(page).queryByText('想到一件要买的小东西')).toBeNull();
    fireEvent.click(within(page).getByRole('button', { name: '隐藏已完成' }));
    expect(within(page).getByRole('button', { name: '显示已完成' })).toBeTruthy();
    expect((history.state as { depth: number }).depth).toBe(rootDepth);
    expect(history.length).toBe(rootLength);
  });

  it('uses browser Back to close quick add and return from the personal editor', async () => {
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(screen.getByRole('button', { name: '编辑任务：整理本周工作票据' }));
    await screen.findByRole('heading', { name: '编辑任务' });
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    expect(screen.getByRole('region', { name: '待办' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '快速新增待办' }));
    await screen.findByRole('dialog', { name: '快速记录' });
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('region', { name: '待办' })).toBeTruthy();
  });

  it('opens each quick-add UI and clearly reports that demo input is not saved', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    fireEvent.click(screen.getByRole('button', { name: '快速新增待办' }));
    let dialog = await screen.findByRole('dialog', { name: '快速记录' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '任务标题' }), { target: { value: '演示任务' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
    expect((await screen.findByRole('status')).textContent).toContain('尚未保存');
    expect(screen.getByRole('dialog', { name: '快速记录' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '进入情侣专区' }));
    fireEvent.animationEnd(screen.getByTestId('space-ripple'));
    await screen.findByRole('region', { name: '我们的小事' });
    fireEvent.click(screen.getByRole('button', { name: '新增情侣事项' }));
    dialog = await screen.findByRole('dialog', { name: '记一件我们的小事' });
    expect(within(dialog).getByText('默认放入未安排')).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('textbox', { name: '事项标题' }), { target: { value: '周末去散步' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '添加' }));
    expect((await screen.findByRole('status')).textContent).toContain('尚未创建');
  });

  it('allows one couple card to slide out and open its editor', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    fireEvent.click(screen.getByRole('button', { name: '进入情侣专区' }));
    fireEvent.animationEnd(screen.getByTestId('space-ripple'));
    const coupleDepth = (history.state as { depth: number }).depth;
    const coupleHistoryLength = history.length;
    fireEvent.click(screen.getByRole('button', { name: '约会' }));
    expect(screen.getByRole('button', { name: '约会' }).getAttribute('aria-pressed')).toBe('true');
    expect((history.state as { depth: number }).depth).toBe(coupleDepth);
    expect(history.length).toBe(coupleHistoryLength);
    const card = await screen.findByRole('button', { name: /找一家喜欢的日料店/ });
    fireEvent.click(card);
    expect(card.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: '完成：找一家喜欢的日料店' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '编辑：找一家喜欢的日料店' }));
    await screen.findByRole('heading', { name: '编辑小事' });
    expect(screen.getByRole('textbox', { name: '事项标题' })).toBeTruthy();
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await screen.findByRole('region', { name: '我们的小事' });
    await waitFor(() => expect(document.querySelector('.couple-card-body')?.getAttribute('aria-expanded')).toBe('true'));
  });

  it('opens history and a single time-range picker, with browser back closing the top layer first', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    fireEvent.click(screen.getByRole('button', { name: '进入情侣专区' }));
    fireEvent.animationEnd(screen.getByTestId('space-ripple'));
    fireEvent.click(screen.getByRole('button', { name: '查看已完成历史' }));
    await screen.findByRole('heading', { name: '完成的时光' });
    fireEvent.click(screen.getByRole('button', { name: '筛选时间范围' }));
    expect(await screen.findByRole('dialog', { name: '选择时间范围' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '近 7 天' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '近 30 天' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '近 3 个月' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '近 6 个月' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '近 1 年' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '自定义时间段' }));
    expect(screen.getByLabelText('开始日期')).toBeTruthy();
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { name: '完成的时光' })).toBeTruthy();
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(screen.getByRole('region', { name: '我们的小事' })).toBeTruthy());
    await act(async () => { history.back(); await new Promise((resolve) => window.setTimeout(resolve, 30)); });
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('personal'));
  });

  it('skips the reveal for reduced motion while preserving space navigation', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    fireEvent.click(screen.getByRole('button', { name: '进入情侣专区' }));
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('couple'));
    expect(screen.queryByTestId('space-ripple')).toBeNull();
  });

  it('preserves the active Todo space across the Foundation module tabs', async () => {
    mockViewportRects();
    render(<App/>);
    await screen.findByRole('heading', { name: '这一周' });
    fireEvent.click(screen.getByRole('button', { name: '进入情侣专区' }));
    fireEvent.animationEnd(screen.getByTestId('space-ripple'));
    await waitFor(() => expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('couple'));
    fireEvent.click(screen.getAllByRole('navigation', { name: '主要导航' })[0].querySelectorAll('button')[1]);
    await screen.findByRole('region', { name: '小月历' });
    fireEvent.click(screen.getAllByRole('navigation', { name: '主要导航' })[0].querySelectorAll('button')[0]);
    await screen.findByRole('region', { name: '我们的小事' });
    expect(document.querySelector('.todo-module-root')?.getAttribute('data-current-space')).toBe('couple');
  });
});
