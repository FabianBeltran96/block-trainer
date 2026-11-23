import { sanitizeKeymap, type Keymap } from '../input/keymap';
import { readJson, writeJson, STORAGE_PREFIX, type KeyValueStorage } from './keyValue';

export const KEYMAP_KEY = `${STORAGE_PREFIX}:keymap`;

export function loadKeymap(storage: KeyValueStorage): Keymap {
  return sanitizeKeymap(readJson(storage, KEYMAP_KEY));
}

export function saveKeymap(storage: KeyValueStorage, keymap: Keymap): void {
  writeJson(storage, KEYMAP_KEY, keymap);
}
