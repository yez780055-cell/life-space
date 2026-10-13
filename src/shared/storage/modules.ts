import { readValue, writeValue } from './database';
import type { ModuleId } from './settings';

// Each module owns one isolated namespace. Future modules define their own value schema.
export function moduleStorage(module: ModuleId) {
  return {
    read: <T>(key: string) => readValue<T>('modules', `${module}:${key}`),
    write: <T>(key: string, value: T) => writeValue('modules', `${module}:${key}`, value)
  };
}
