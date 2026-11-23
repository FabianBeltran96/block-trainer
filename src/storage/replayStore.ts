import { parseReplay, type ReplayData } from '../replay/replay';
import { readJson, writeJson, STORAGE_PREFIX, type KeyValueStorage } from './keyValue';

export const REPLAYS_KEY = `${STORAGE_PREFIX}:replays`;
export const REPLAY_LIMIT = 10;

/** Newest first. Corrupt entries are dropped. */
export function loadReplays(storage: KeyValueStorage): ReplayData[] {
  const raw = readJson(storage, REPLAYS_KEY);
  if (!Array.isArray(raw)) return [];
  const replays: ReplayData[] = [];
  for (const entry of raw) {
    try {
      replays.push(parseReplay(entry));
    } catch {
      // skip corrupt entry
    }
  }
  return replays.slice(0, REPLAY_LIMIT);
}

/** Adds a replay, dropping the oldest ones if storage quota is exceeded. */
export function addReplay(storage: KeyValueStorage, replay: ReplayData): ReplayData[] {
  let replays = [replay, ...loadReplays(storage).filter((r) => r.id !== replay.id)].slice(0, REPLAY_LIMIT);
  while (replays.length > 0 && !writeJson(storage, REPLAYS_KEY, replays)) {
    replays = replays.slice(0, -1);
  }
  return replays;
}
