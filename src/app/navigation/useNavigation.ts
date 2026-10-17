import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { initialSnapshot, openGuide, openSurface, switchModule, type AnniversaryScreen, type NavigationSnapshot, type Surface, type PeriodScreen, type TodoScreen, type TodoSpace } from './model';
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
  const pendingTab = useRef<{ module: ModuleId; pages: NavigationSnapshot['pages']; todoSpace: NavigationSnapshot['todoSpace']; todoScreen: NavigationSnapshot['todoScreen']; periodScreen: NavigationSnapshot['periodScreen']; anniversaryScreen: NavigationSnapshot['anniversaryScreen']; anniversaryRecordId: string | null; anniversaryEditorReturn: NavigationSnapshot['anniversaryEditorReturn'] } | null>(null);
  const pendingTraversal = useRef(false);
  const guardBounce = useRef(false);
  const todoSpaceForward = useRef(false);
  const lastExit = useRef(0);
  const bootStarted = useRef(false);

  const setCurrent = useCallback((next: NavigationSnapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);
  const resetExit = useCallback(() => { lastExit.current = 0; setExitHint(false); }, []);
  const entry = useCallback((next: NavigationSnapshot, nextDepth: number): HistoryEntry => ({ [HISTORY_KEY]: id.current, depth: nextDepth, epoch: epoch.current, snapshot: next }), []);
  const canLeaveCurrent = useCallback(() => {
    const event = new Event('life-space-navigation-back', { cancelable: true });
    window.dispatchEvent(event);
    return !event.defaultPrevented;
  }, []);

  const commitTab = useCallback((module: ModuleId, pages: NavigationSnapshot['pages'], base: NavigationSnapshot) => {
    epoch.current += 1;
    const todoScreenToRestore = base.todoScreen;
    const todoSpaceToRestore = base.todoSpace;
    const periodScreenToRestore = base.periodScreen;
    const anniversaryScreenToRestore = base.anniversaryScreen;
    const anniversaryRecordIdToRestore = base.anniversaryRecordId;
    const anniversaryEditorReturnToRestore = base.anniversaryEditorReturn;
    todoSpaceForward.current = false;
    const root = switchModule({
      ...base,
      pages: { ...pages, [module]: 'home' },
      surfaces: [],
      ...(module === 'todo' ? { todoSpace: 'personal' as const, todoScreen: 'home' as const } : {}),
      ...(module === 'period' ? { periodScreen: 'calendar' as const } : {}),
      ...(module === 'anniversary' ? { anniversaryScreen: 'home' as const, anniversaryRecordId: null, anniversaryEditorReturn: 'home' as const } : {})
    }, module);
    depth.current = 0;
    history.replaceState(entry(root, 0), '');
    if (pages[module] === 'guide') {
      const detail = openGuide(root);
      depth.current = 1;
      history.pushState(entry(detail, 1), '');
      setCurrent(detail);
      return;
    }

    // Todo keeps its home at the app root. Rebuild the selected space and child
    // page above that root when returning from a sibling Foundation module.
    let restored = root;
    if (module === 'todo' && todoSpaceToRestore === 'couple') {
      restored = { ...restored, todoSpace: 'couple' };
      depth.current += 1;
      history.pushState(entry(restored, depth.current), '');
    }
    if (module === 'todo' && todoScreenToRestore !== 'home') {
      restored = { ...restored, todoScreen: todoScreenToRestore };
      depth.current += 1;
      history.pushState(entry(restored, depth.current), '');
    }
    if (module === 'period' && periodScreenToRestore !== 'calendar') {
      restored = { ...restored, periodScreen: periodScreenToRestore };
      depth.current += 1;
      history.pushState(entry(restored, depth.current), '');
    }
    if (module === 'anniversary' && anniversaryScreenToRestore === 'detail') {
      restored = { ...restored, anniversaryScreen: 'detail', anniversaryRecordId: anniversaryRecordIdToRestore, anniversaryEditorReturn: anniversaryEditorReturnToRestore };
      depth.current += 1;
      history.pushState(entry(restored, depth.current), '');
    }
    if (module === 'anniversary' && anniversaryScreenToRestore === 'editor') {
      if (anniversaryEditorReturnToRestore === 'detail') {
        restored = { ...restored, anniversaryScreen: 'detail', anniversaryRecordId: anniversaryRecordIdToRestore, anniversaryEditorReturn: 'detail' };
        depth.current += 1;
        history.pushState(entry(restored, depth.current), '');
      }
      restored = { ...restored, anniversaryScreen: 'editor', anniversaryRecordId: anniversaryRecordIdToRestore, anniversaryEditorReturn: anniversaryEditorReturnToRestore };
      depth.current += 1;
      history.pushState(entry(restored, depth.current), '');
    }
    setCurrent(restored);
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
        pendingTraversal.current = false;
        if (state?.[HISTORY_KEY] && state.depth > 0) history.go(-state.depth);
        return;
      }
      if (guardBounce.current) { guardBounce.current = false; return; }
      const isProgrammaticTraversal = pendingTraversal.current || pendingTab.current !== null;
      pendingTraversal.current = false;
      if (!isProgrammaticTraversal && !canLeaveCurrent()) {
        guardBounce.current = true;
        history.forward();
        return;
      }
      if (pendingTab.current) {
        todoSpaceForward.current = false;
        const { module, pages, todoSpace, todoScreen, periodScreen, anniversaryScreen, anniversaryRecordId, anniversaryEditorReturn } = pendingTab.current;
        pendingTab.current = null;
        commitTab(module, pages, { ...state.snapshot, todoSpace, todoScreen, periodScreen, anniversaryScreen, anniversaryRecordId, anniversaryEditorReturn });
      } else if (state.epoch !== epoch.current) {
        // A tab switch can leave old child entries ahead of the root. Bounce
        // back to the root instead of turning the stale entry into a phantom root.
        history.go(-Math.max(1, state.depth));
      } else {
        const previous = current.current;
        todoSpaceForward.current = previous.module === 'todo'
          && previous.todoSpace === 'couple'
          && previous.todoScreen === 'home'
          && previous.surfaces.length === 0
          && state.snapshot.module === 'todo'
          && state.snapshot.todoSpace === 'personal'
          && state.snapshot.todoScreen === 'home'
          && state.snapshot.surfaces.length === 0;
        depth.current = state.depth;
        setCurrent(state.snapshot);
      }
    };
    addEventListener('popstate', onPop);
    return () => { removeEventListener('popstate', onPop); removeEventListener('popstate', onBootPop); };
  }, [canLeaveCurrent, commitTab, entry, setCurrent]);

  const push = useCallback((next: NavigationSnapshot) => {
    resetExit();
    todoSpaceForward.current = false;
    depth.current += 1;
    history.pushState(entry(next, depth.current), '');
    setCurrent(next);
  }, [entry, resetExit, setCurrent]);

  const back = useCallback(async () => {
    if (!canLeaveCurrent()) return;
    if (depth.current > 0) {
      if (pendingTraversal.current) return;
      pendingTraversal.current = true;
      history.back();
      return;
    }
    if (current.current.module === 'todo' && current.current.todoSpace === 'couple') {
      const personal = { ...current.current, todoSpace: 'personal' as const, todoScreen: 'home' as const, surfaces: [] };
      todoSpaceForward.current = false;
      history.replaceState(entry(personal, 0), '');
      setCurrent(personal);
      return;
    }
    if (!Capacitor.isNativePlatform()) return;
    const now = Date.now();
    if (now - lastExit.current < EXIT_WINDOW_MS) { await NativeApp.exitApp(); return; }
    lastExit.current = now;
    setExitHint(true);
    window.setTimeout(() => setExitHint(false), EXIT_WINDOW_MS);
  }, [canLeaveCurrent, entry, setCurrent]);

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
    if (!canLeaveCurrent()) return;
    resetExit();
    if (pendingTab.current || pendingTraversal.current) return;
    todoSpaceForward.current = false;
    // Return to the app's root history entry before replacing the active tab.
    if (depth.current > 0) {
      pendingTab.current = { module, pages: current.current.pages, todoSpace: current.current.todoSpace, todoScreen: current.current.todoScreen, periodScreen: current.current.periodScreen, anniversaryScreen: current.current.anniversaryScreen, anniversaryRecordId: current.current.anniversaryRecordId, anniversaryEditorReturn: current.current.anniversaryEditorReturn };
      history.go(-depth.current);
    } else {
      commitTab(module, current.current.pages, current.current);
    }
    void saveLastModule(module).catch(() => onError('无法保存上次打开的空间，请检查设备存储'));
  }, [canLeaveCurrent, commitTab, onError, resetExit]);

  return {
    snapshot, historyReady, exitHint, selectModule,
    showGuide: () => push(openGuide(current.current)),
    showTodoSpace: (space: TodoSpace) => {
      if (current.current.module !== 'todo' || current.current.todoSpace === space || current.current.todoScreen !== 'home' || current.current.surfaces.length > 0 || pendingTraversal.current) return;
      resetExit();
      if (space === 'couple' && todoSpaceForward.current) {
        todoSpaceForward.current = false;
        if (pendingTraversal.current) return;
        pendingTraversal.current = true;
        history.forward();
        return;
      }
      if (space === 'personal') {
        if (pendingTraversal.current) return;
        if (depth.current > 0) {
          pendingTraversal.current = true;
          history.back();
        } else {
          // Defensive normalization for a legacy or malformed root snapshot.
          const personal = { ...current.current, todoSpace: 'personal' as const, todoScreen: 'home' as const, surfaces: [] };
          todoSpaceForward.current = false;
          history.replaceState(entry(personal, depth.current), '');
          setCurrent(personal);
        }
        return;
      }
      push({ ...current.current, todoSpace: 'couple', todoScreen: 'home', surfaces: [] });
    },
    showPeriodScreen: (screen: PeriodScreen) => {
      if (current.current.module !== 'period' || current.current.periodScreen === screen || current.current.surfaces.length > 0 || pendingTraversal.current) return;
      push({ ...current.current, periodScreen: screen, surfaces: [] });
    },
    showAnniversaryScreen: (screen: AnniversaryScreen, recordId?: string) => {
      const existing = current.current;
      if (existing.module !== 'anniversary' || existing.surfaces.length > 0 || pendingTraversal.current) return;
      if (screen === 'detail' && existing.anniversaryScreen === 'home') {
        push({ ...existing, anniversaryScreen: 'detail', anniversaryRecordId: recordId ?? null, anniversaryEditorReturn: 'home', surfaces: [] });
      } else if (screen === 'editor' && (existing.anniversaryScreen === 'home' || existing.anniversaryScreen === 'detail')) {
        push({ ...existing, anniversaryScreen: 'editor', anniversaryRecordId: recordId ?? null, anniversaryEditorReturn: existing.anniversaryScreen, surfaces: [] });
      }
    },
    returnAnniversaryHome: () => {
      if (current.current.module !== 'anniversary' || pendingTraversal.current) return;
      if (depth.current > 0) {
        pendingTraversal.current = true;
        history.go(-depth.current);
      } else {
        const home = { ...current.current, anniversaryScreen: 'home' as const, anniversaryRecordId: null, anniversaryEditorReturn: 'home' as const, surfaces: [] };
        history.replaceState(entry(home, 0), '');
        setCurrent(home);
      }
    },
    showTodoScreen: (screen: TodoScreen) => {
      if (current.current.module !== 'todo' || current.current.todoScreen === screen || current.current.surfaces.length > 0 || pendingTraversal.current) return;
      push({ ...current.current, todoScreen: screen, surfaces: [] });
    },
    showSurface: (surface: Surface) => {
      if (surface === 'settings' && !canLeaveCurrent()) return;
      if (current.current.surfaces.includes(surface) || pendingTraversal.current) return;
      push(openSurface(current.current, surface));
    },
    back
  };
}
