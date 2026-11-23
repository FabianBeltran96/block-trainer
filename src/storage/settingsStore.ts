import type { GravityConfig } from '../engine';
import { DEFAULT_HANDLING, sanitizeHandling, type HandlingConfig } from '../input/config';
import { readJson, writeJson, STORAGE_PREFIX, type KeyValueStorage } from './keyValue';

export const SETTINGS_KEY = `${STORAGE_PREFIX}:settings`;

export interface TrainerSettings {
  readonly handling: HandlingConfig;
  readonly gravity: GravityConfig;
  /** Count 180-degree rotation as one available input when computing optimal finesse. */
  readonly allow180: boolean;
}

export const DEFAULT_SETTINGS: TrainerSettings = {
  handling: DEFAULT_HANDLING,
  gravity: { enabled: false, rowsPerSecond: 1 },
  allow180: true,
};

export function sanitizeSettings(input: unknown): TrainerSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const gravity = (raw.gravity ?? {}) as Record<string, unknown>;
  const rps = Number(gravity.rowsPerSecond);
  return {
    handling: sanitizeHandling(raw.handling),
    gravity: {
      enabled: gravity.enabled === true,
      rowsPerSecond: Number.isFinite(rps) && rps > 0 ? Math.min(rps, 60) : DEFAULT_SETTINGS.gravity.rowsPerSecond,
    },
    allow180: raw.allow180 !== false,
  };
}

export function loadSettings(storage: KeyValueStorage): TrainerSettings {
  return sanitizeSettings(readJson(storage, SETTINGS_KEY));
}

export function saveSettings(storage: KeyValueStorage, settings: TrainerSettings): void {
  writeJson(storage, SETTINGS_KEY, settings);
}
