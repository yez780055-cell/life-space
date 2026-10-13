import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { initialSnapshot, openGuide, openSurface, switchModule, type NavigationSnapshot, type Surface } from './model';
import { saveLastModule, type ModuleId } from '../../shared/storage/settings';

const HISTORY_KEY = '__lifeSpaceFoundation';
const EXIT_WINDOW_MS = 1800;

type HistoryEntry = { [HISTORY_KEY]: string; depth: number; epoch: number; snapshot: NavigationSnapshot };

export function useNavigation(startModule: ModuleId, onError: (message: string) => void) {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(startModule));
  const [historyReady, setHistoryReady] = useState(() => {
    const previous = history.state as HistoryEntry | null;
    return !(previous?.[HISTORY_KEY] && previous.depth > 0);
  });
  const [exitHint, setExitHint] = useState(false);
  const id = useRef(crypto.randomUUID());
  const depth = useRef(0);
  const epoch = useRef(0);
  const current = useRef(snapshot);
  const pendingTab = useRef<{ module: ModuleId; pages: NavigationSnapshot['pages'] } | null>(null);
  const pendingBack = useRef(false);
  const lastExit = useRef(0);
  const bootStarted = useRef(false);

  const setCurrent = useCallback((next: NavigationSnapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);
  const resetExit = useCallback(() => { lastExit.current = 0; setExitHint(false); }, []);
  const entry = useCallback((next: NavigationSnapshot, nextDepth: number): HistoryEntry => ({ [HISTORY_KEY]: id.current, depth: nextDepth, epoch: epoch.current, snapshot: next }), []);

  const commitTab = useCallback((module: ModuleId, pages: NavigationSnapshot['pages'], base: NavigationSnapshot) => {
    epoch.current += 1;
    const root = switchModule({ ...base, pages: { ...pages, [module]: 'home' } }, module);
    depth.current = 0;
    history.replaceState(entry(root, 0), '');
    if (pages[module] === 'guide') {
      const detail = openGuide(root);
      depth.current = 1;
      history.pushState(entry(detail, 1), '');
      setCurrent(detail);
    } else setCurrent(root);
  }, [entry, setCurrent]);

  useEffect(() => {
    const previous = history.state as HistoryEntry | null;
    const settle = () => {
      depth.current = 0;
      history.replaceState(entry(current.current, 0), '');
      if (previous?.[HISTORY_KEY] && previous.depth > 0) setHistoryReady(true);
    };
    const onBootPop = (event: PopStateEvent) => {
      const state = event.state as HistoryEntry | null;
      if (state?.[HISTORY_KEY] === previous?.[HISTORY_KEY] && state?.depth === 0) {
        removeEventListener('popstate', onBootPop);
        settle();
      }
    };
    if (previous?.[HISTORY_KEY] && previous.depth > 0) {
      addEventListener('popstate', onBootPop);
      if (!bootStarted.current) { bootStarted.current = true; history.go(-previous.depth); }
    } else settle();
    const onPop = (event: PopStateEvent) => {
      const state = event.state as HistoryEntry | null;
      if (state?.[HISTORY_KEY] !== id.current) {
        if (state?.[HISTORY_KEY] && state.depth > 0) history.go(-state.depth);
        return;
      }
      pendingBack.current = false;
      if (pendingTab.current) {
        const { module, pages } = pendingTab.current;
        pendingTab.current = null;
        commitTab(module, pages, state.snapshot);
      } else if (state.epoch !== epoch.current) {
        // A tab switch can leave old child entries ahead of the root. Bounce
        // back to the root instead of turning the stale entry into a phantom root.
        history.go(-Math.max(1, state.depth));
      } else { depth.current = state.depth; setCurrent(state.snapshot); }
    };
    addEventListener('popstate', onPop);
    return () => { removeEventListener('popstate', onPop); removeEventListener('popstate', onBootPop); };
  }, [commitTab, entry, setCurrent]);

  const push = useCallback((next: NavigationSnapshot) => {
    resetExit();
    depth.current += 1;
    history.pushState(entry(next, depth.current), '');
    setCurrent(next);
  }, [entry, resetExit, setCurrent]);

  const back = useCallback(async () => {
    if (depth.current > 0) {
      if (pendingBack.current) return;
      pendingBack.current = true;
      history.back();
      return;
    }
    if (!Capacitor.isNativePlatform()) return;
    const now = Date.now();
    if (now - lastExit.current < EXIT_WINDOW_MS) { await NativeApp.exitApp(); return; }
    lastExit.current = now;
    setExitHint(true);
    window.setTimeout(() => setExitHint(false), EXIT_WINDOW_MS);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    NativeApp.addListener('backButton', () => { void back(); }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    }).catch(() => onError('Android 返回键暂不可用'));
    return () => { disposed = true; void listener?.remove(); };
  }, [back, onError]);

  const selectModule = useCallback((module: ModuleId) => {
    if (module === current.current.module && current.current.surfaces.length === 0) return;
    resetExit();
    if (pendingTab.current || pendingBack.current) return;
    // Return to the app's root history entry before replacing the active tab.
    if (depth.current > 0) {
      pendingTab.current = { module, pages: current.current.pages };
      history.go(-depth.current);
    } else {
      commitTab(module, current.current.pages, current.current);
    }
    void saveLastModule(module).catch(() => onError('无法保存上次打开的空间，请检查设备存储'));
  }, [commitTab, onError, resetExit]);

  return {
    snapshot, historyReady, exitHint, selectModule,
    showGuide: () => push(openGuide(current.current)),
    showSurface: (surface: Surface) => {
      if (current.current.surfaces.includes(surface)) return;
      push(openSurface(current.current, surface));
    },
    back
  };
}
