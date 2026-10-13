import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ listener: vi.fn(), remove: vi.fn(), exit: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (_event: string, listener: () => void) => { native.listener.mockImplementation(listener); return { remove: native.remove }; }),
  exitApp: native.exit
} }));

import { useNavigation } from './useNavigation';

beforeEach(() => {
  history.replaceState(null, '');
  native.listener.mockReset(); native.remove.mockReset(); native.exit.mockReset();
});
afterEach(() => vi.restoreAllMocks());

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
