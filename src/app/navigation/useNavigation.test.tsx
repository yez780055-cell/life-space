import { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ platform: true, listener: vi.fn(), remove: vi.fn(), exit: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.platform } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (_event: string, listener: () => void) => { native.listener.mockImplementation(listener); return { remove: native.remove }; }),
  exitApp: native.exit
} }));

import { useNavigation } from './useNavigation';

beforeEach(() => {
  history.replaceState(null, '');
  native.platform = true;
  native.listener.mockReset(); native.remove.mockReset(); native.exit.mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Android back handling', () => {
  it('requires two consecutive root presses and resets after a tab change', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(10000);
    const { result } = renderHook(() => useNavigation('todo', () => undefined));
    await waitFor(() => expect(native.listener.getMockImplementation()).toBeTruthy());
    act(() => native.listener());
    expect(result.current.exitHint).toBe(true);
    expect(native.exit).not.toHaveBeenCalled();
    act(() => result.current.selectModule('period'));
    expect(result.current.exitHint).toBe(false);
    act(() => native.listener());
    expect(native.exit).not.toHaveBeenCalled();
    now.mockReturnValue(11000);
    act(() => native.listener());
    expect(native.exit).toHaveBeenCalledOnce();
  });

  it('does not exit after the 1.8 second window or while closing a modal', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(10000);
    const { result } = renderHook(() => useNavigation('todo', () => undefined));
    await waitFor(() => expect(native.listener.getMockImplementation()).toBeTruthy());
    act(() => native.listener());
    now.mockReturnValue(12000);
    act(() => native.listener());
    expect(native.exit).not.toHaveBeenCalled();
    act(() => result.current.showSurface('about'));
    act(() => native.listener());
    await waitFor(() => expect(result.current.snapshot.surfaces).toEqual([]));
    expect(native.exit).not.toHaveBeenCalled();
    act(() => native.listener());
    expect(native.exit).not.toHaveBeenCalled();
  });

  it('removes every registered listener under StrictMode', async () => {
    const { unmount } = renderHook(() => useNavigation('todo', () => undefined), { wrapper: StrictMode });
    await waitFor(() => expect(native.remove).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(native.remove).toHaveBeenCalledTimes(2));
  });
});

describe('web navigation layers', () => {
  beforeEach(() => {
    native.platform = false;
    history.pushState({ outside: 'previous' }, '', '#previous');
    history.pushState({ outside: 'app-entry' }, '', '#app-entry');
  });

  async function waitForSnapshot(result: { current: ReturnType<typeof useNavigation> }, matches: (snapshot: ReturnType<typeof useNavigation>['snapshot']) => boolean) {
    await waitFor(() => expect(matches(result.current.snapshot), JSON.stringify({ snapshot: result.current.snapshot, state: history.state, length: history.length })).toBe(true));
  }

  it('reuses one couple-space history entry across repeated personal/couple toggles', async () => {
    const { result } = renderHook(() => useNavigation('todo', () => undefined));
    await waitFor(() => expect((history.state as { depth: number }).depth).toBe(0));
    const rootLength = history.length;

    for (let index = 0; index < 3; index += 1) {
      act(() => result.current.showTodoSpace('couple'));
      await waitForSnapshot(result, (state) => state.todoSpace === 'couple');
      act(() => result.current.showTodoSpace('personal'));
      await waitForSnapshot(result, (state) => state.todoSpace === 'personal');
      expect((history.state as { depth: number }).depth).toBe(0);
    }

    expect(history.length).toBe(rootLength + 1);
    history.back();
    await waitFor(() => expect(history.state).toEqual({ outside: 'previous' }));
    expect(result.current.snapshot.todoSpace).toBe('personal');
  });

  it('returns child pages and surfaces through their parent space in order', async () => {
    const { result } = renderHook(() => useNavigation('todo', () => undefined));
    await waitFor(() => expect((history.state as { depth: number }).depth).toBe(0));
    act(() => result.current.showTodoSpace('couple'));
    await waitForSnapshot(result, (state) => state.todoSpace === 'couple');
    act(() => result.current.showTodoScreen('couple-history'));
    await waitForSnapshot(result, (state) => state.todoScreen === 'couple-history');
    act(() => result.current.showSurface('history-filter'));
    await waitForSnapshot(result, (state) => state.surfaces.at(-1) === 'history-filter');

    act(() => { void result.current.back(); });
    await waitForSnapshot(result, (state) => state.todoScreen === 'couple-history' && state.surfaces.length === 0);
    act(() => { void result.current.back(); });
    await waitForSnapshot(result, (state) => state.todoSpace === 'couple' && state.todoScreen === 'home');
    act(() => { void result.current.back(); });
    await waitForSnapshot(result, (state) => state.todoSpace === 'personal' && state.todoScreen === 'home');
  });

  it('returns both personal and couple editors to their owning space', async () => {
    const { result } = renderHook(() => useNavigation('todo', () => undefined));
    await waitFor(() => expect((history.state as { depth: number }).depth).toBe(0));
    act(() => result.current.showTodoScreen('personal-editor'));
    await waitForSnapshot(result, (state) => state.todoScreen === 'personal-editor');
    act(() => { void result.current.back(); });
    await waitForSnapshot(result, (state) => state.todoSpace === 'personal' && state.todoScreen === 'home');

    act(() => result.current.showTodoSpace('couple'));
    await waitForSnapshot(result, (state) => state.todoSpace === 'couple');
    act(() => result.current.showTodoScreen('couple-editor'));
    await waitForSnapshot(result, (state) => state.todoScreen === 'couple-editor');
    act(() => { void result.current.back(); });
    await waitForSnapshot(result, (state) => state.todoSpace === 'couple' && state.todoScreen === 'home');
  });

  it('replaces sibling module roots without adding a browser back chain', async () => {
    const { result } = renderHook(() => useNavigation('todo', () => undefined));
    await waitFor(() => expect((history.state as { depth: number }).depth).toBe(0));
    const rootLength = history.length;
    act(() => result.current.selectModule('period'));
    expect(result.current.snapshot.module).toBe('period');
    act(() => result.current.selectModule('anniversary'));
    expect(result.current.snapshot.module).toBe('anniversary');
    act(() => result.current.selectModule('todo'));
    expect(result.current.snapshot.module).toBe('todo');
    expect((history.state as { depth: number }).depth).toBe(0);
    expect(history.length).toBe(rootLength);
  });
});


describe('Period navigation', () => {
  beforeEach(() => {
    native.platform = false;
    history.replaceState(null, '');
  });

  it('returns overlays and subpages through unified browser history and restores the Period screen after tab switches', async () => {
    const { result } = renderHook(() => useNavigation('period', () => undefined));
    const waitPeriodState = (matches: (snapshot: typeof result.current.snapshot) => boolean) => waitFor(() => expect(matches(result.current.snapshot)).toBe(true));
    await waitFor(() => expect((history.state as { depth: number }).depth).toBe(0));

    act(() => result.current.showPeriodScreen('stats'));
    await waitPeriodState((state) => state.module === 'period' && state.periodScreen === 'stats');
    act(() => result.current.showSurface('period-dialog'));
    await waitPeriodState((state) => state.surfaces.at(-1) === 'period-dialog');

    act(() => { void result.current.back(); });
    await waitPeriodState((state) => state.periodScreen === 'stats' && state.surfaces.length === 0);
    act(() => { void result.current.back(); });
    await waitPeriodState((state) => state.periodScreen === 'calendar');

    act(() => result.current.showPeriodScreen('settings'));
    await waitPeriodState((state) => state.periodScreen === 'settings');
    act(() => result.current.selectModule('todo'));
    await waitPeriodState((state) => state.module === 'todo');
    act(() => result.current.selectModule('period'));
    await waitPeriodState((state) => state.module === 'period' && state.periodScreen === 'settings');
    act(() => { void result.current.back(); });
    await waitPeriodState((state) => state.periodScreen === 'calendar');
  });
});
