import { parsePatternKey } from '../modes/weakspots/patterns';
import { RECENT_WINDOW, type DrillSummary, type PatternStats, type WeakSpotStats } from '../modes/weakspots/weakSpots';
import { readJson, writeJson, STORAGE_PREFIX, type KeyValueStorage } from './keyValue';

export const WEAK_SPOTS_KEY = `${STORAGE_PREFIX}:weak-spots`;

export interface WeakSpotData {
  readonly stats: WeakSpotStats;
  readonly lastDrill: DrillSummary | null;
}

export const EMPTY_WEAK_SPOTS: WeakSpotData = { stats: {}, lastDrill: null };

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (typeof v === 'object' && v !== null ? (v as Raw) : {});
const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

function parseStats(value: unknown): PatternStats {
  const r = asRaw(value);
  const recent = typeof r.recent === 'string' ? r.recent.replace(/[^01]/g, '').slice(-RECENT_WINDOW) : '';
  return {
    attempts: count(r.attempts),
    faults: count(r.faults),
    recent,
  };
}

function parseDrill(value: unknown): DrillSummary | null {
  const r = asRaw(value);
  if (typeof r.date !== 'string' || !Array.isArray(r.patterns)) return null;
  return {
    date: r.date,
    reps: count(r.reps),
    clean: count(r.clean),
    patterns: r.patterns
      .map(asRaw)
      .filter((p) => typeof p.key === 'string' && parsePatternKey(p.key) !== null)
      .map((p) => ({ key: p.key as string, attempts: count(p.attempts), clean: count(p.clean) })),
  };
}

export function loadWeakSpots(storage: KeyValueStorage): WeakSpotData {
  const raw = asRaw(readJson(storage, WEAK_SPOTS_KEY));
  const stats: Record<string, PatternStats> = {};
  for (const [key, value] of Object.entries(asRaw(raw.stats))) {
    if (parsePatternKey(key)) stats[key] = parseStats(value);
  }
  return { stats, lastDrill: parseDrill(raw.lastDrill) };
}

export function saveWeakSpots(storage: KeyValueStorage, data: WeakSpotData): void {
  writeJson(storage, WEAK_SPOTS_KEY, data);
}
