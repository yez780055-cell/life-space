import { DEFAULT_MODULE, type ModuleId } from '../../shared/storage/settings';

export type Page = 'home' | 'guide';
export type TodoSpace = 'personal' | 'couple';
export type TodoScreen = 'home' | 'personal-month-focus' | 'personal-editor' | 'couple-editor' | 'couple-history';
export type PeriodScreen = 'calendar' | 'stats' | 'settings';
export type Surface = 'settings' | 'about' | 'todo-add-personal' | 'todo-add-couple' | 'history-filter' | 'period-dialog';
export type NavigationSnapshot = {
  module: ModuleId;
  pages: Record<ModuleId, Page>;
  todoSpace: TodoSpace;
  todoScreen: TodoScreen;
  periodScreen: PeriodScreen;
  surfaces: Surface[];
};

export function initialSnapshot(module: ModuleId = DEFAULT_MODULE): NavigationSnapshot {
  return { module, pages: { todo: 'home', period: 'home', anniversary: 'home' }, todoSpace: 'personal', todoScreen: 'home', periodScreen: 'calendar', surfaces: [] };
}

export function openGuide(state: NavigationSnapshot): NavigationSnapshot {
  return { ...state, pages: { ...state.pages, [state.module]: 'guide' } };
}

export function openSurface(state: NavigationSnapshot, surface: Surface): NavigationSnapshot {
  return { ...state, surfaces: [...state.surfaces, surface] };
}

export function switchModule(state: NavigationSnapshot, module: ModuleId): NavigationSnapshot {
  return { ...state, module, surfaces: [] };
}

export function currentLayer(state: NavigationSnapshot): Surface | Page | PeriodScreen {
  return state.surfaces.at(-1) ?? (state.module === 'period' && state.pages.period === 'home' ? state.periodScreen : state.pages[state.module]);
}