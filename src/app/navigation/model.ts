import { DEFAULT_MODULE, type ModuleId } from '../../shared/storage/settings';

export type Page = 'home' | 'guide';
export type Surface = 'settings' | 'about';
export type NavigationSnapshot = {
  module: ModuleId;
  pages: Record<ModuleId, Page>;
  surfaces: Surface[];
};

export function initialSnapshot(module: ModuleId = DEFAULT_MODULE): NavigationSnapshot {
  return { module, pages: { todo: 'home', period: 'home', anniversary: 'home' }, surfaces: [] };
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

export function currentLayer(state: NavigationSnapshot): Surface | Page {
  return state.surfaces.at(-1) ?? state.pages[state.module];
}
