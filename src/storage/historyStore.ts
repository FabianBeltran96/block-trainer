import type { SessionStats } from '../modes/finesse/session';
import { readJson, writeJson, STORAGE_PREFIX, type KeyValueStorage } from './keyValue';

export const HISTORY_KEY = `${STORAGE_PREFIX}:history`;
export const HISTORY_LIMIT = 50;

export interface SessionSummary {
  readonly date: string;
  readonly pieces: number;
  readonly durationMs: number;
  readonly pps: number;
  readonly kpp: number;
  readonly finessePct: number;
  readonly faults: number;
}

export function summarize(stats: SessionStats, date: Date = new Date()): SessionSummary {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    date: date.toISOString(),
    pieces: stats.pieces,
    durationMs: Math.round(stats.durationMs),
    pps: round2(stats.pps),
    kpp: round2(stats.kpp),
    finessePct: round2(stats.finessePct),
    faults: stats.faults,
  };
}

function isSummary(value: unknown): value is SessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === 'string' &&
    ['pieces', 'durationMs', 'pps', 'kpp', 'finessePct', 'faults'].every((k) => typeof v[k] === 'number')
  );
}

/** Newest first. */
export function loadHistory(storage: KeyValueStorage): SessionSummary[] {
  const raw = readJson(storage, HISTORY_KEY);
  return Array.isArray(raw) ? raw.filter(isSummary).slice(0, HISTORY_LIMIT) : [];
}

export function addSession(storage: KeyValueStorage, summary: SessionSummary): SessionSummary[] {
  const history = [summary, ...loadHistory(storage)].slice(0, HISTORY_LIMIT);
  writeJson(storage, HISTORY_KEY, history);
  return history;
}
