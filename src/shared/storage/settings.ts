import { readValue, writeValue } from './database';

export type ModuleId = 'todo' | 'period' | 'anniversary';
export const DEFAULT_MODULE: ModuleId = 'todo';
export const MODULES: ModuleId[] = ['todo', 'period', 'anniversary'];

export function validModule(value: unknown): ModuleId {
  return MODULES.includes(value as ModuleId) ? value as ModuleId : DEFAULT_MODULE;
}

export async function loadLastModule(): Promise<ModuleId> {
  return validModule(await readValue<unknown>('settings', 'lastModule'));
}

export async function saveLastModule(module: ModuleId): Promise<void> {
  await writeValue('settings', 'lastModule', module);
}
