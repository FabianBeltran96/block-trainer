import type { CalibrationRun } from '../modes/training/calibration';
import type { TrialResult } from '../modes/training/trial';
import { UPGRADE_LADDER, type UpgradeProgress } from '../modes/training/upgrade';
import { sanitizeHandling } from '../input/config';
import { parseReplay } from '../replay/replay';
import { readJson, writeJson, STORAGE_PREFIX, type KeyValueStorage } from './keyValue';

export const CALIBRATION_KEY = `${STORAGE_PREFIX}:calibration`;
export const UPGRADE_KEY = `${STORAGE_PREFIX}:upgrade`;

type Raw = Record<string, unknown>;
const asRaw = (value: unknown): Raw => (typeof value === 'object' && value !== null ? (value as Raw) : {});
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function parseResult(value: unknown): TrialResult {
  const raw = asRaw(value);
  return {
    label: typeof raw.label === 'string' ? raw.label : '?',
    handling: sanitizeHandling(raw.handling),
    pieces: num(raw.pieces),
    durationMs: num(raw.durationMs),
    pps: num(raw.pps),
    kpp: num(raw.kpp),
    faults: num(raw.faults),
    finessePct: num(raw.finessePct),
    score: num(raw.score),
    replay: parseReplay(raw.replay),
    ...(typeof raw.round === 'number' ? { round: raw.round } : {}),
  };
}

export function loadCalibration(storage: KeyValueStorage): CalibrationRun | null {
  try {
    const raw = asRaw(readJson(storage, CALIBRATION_KEY));
    if (!Array.isArray(raw.trials) || !Array.isArray(raw.results)) return null;
    return {
      seed: num(raw.seed),
      pieces: num(raw.pieces, 40),
      reps: Math.max(1, num(raw.reps, 1)),
      trials: raw.trials.map((t: unknown) => {
        const trial = asRaw(t);
        return {
          label: typeof trial.label === 'string' ? trial.label : '?',
          handling: sanitizeHandling(trial.handling),
          seed: num(trial.seed),
          pieces: num(trial.pieces, 40),
          ...(typeof trial.round === 'number' ? { round: trial.round } : {}),
        };
      }),
      results: raw.results.map(parseResult),
      excluded: Array.isArray(raw.excluded) ? raw.excluded.filter((l): l is string => typeof l === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function saveCalibration(storage: KeyValueStorage, run: CalibrationRun): void {
  writeJson(storage, CALIBRATION_KEY, run);
}

export function loadUpgrade(storage: KeyValueStorage): UpgradeProgress | null {
  try {
    const raw = asRaw(readJson(storage, UPGRADE_KEY));
    const bestRaw: unknown[] | null = Array.isArray(raw.bestPps) ? raw.bestPps : null;
    if (!bestRaw) return null;
    const max = UPGRADE_LADDER.length - 1;
    const last = raw.lastAttempt ? asRaw(raw.lastAttempt) : null;
    return {
      startLevel: Math.min(max, Math.max(0, num(raw.startLevel))),
      unlocked: Math.min(max, Math.max(0, num(raw.unlocked))),
      bestPps: UPGRADE_LADDER.map((_, i) => {
        const value = bestRaw[i];
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      }),
      lastAttempt: last
        ? {
            level: num(last.level),
            pps: num(last.pps),
            finessePct: num(last.finessePct),
            passed: last.passed === true,
            reason: typeof last.reason === 'string' ? last.reason : '',
            replay: parseReplay(last.replay),
          }
        : null,
    };
  } catch {
    return null;
  }
}

export function saveUpgrade(storage: KeyValueStorage, progress: UpgradeProgress): void {
  writeJson(storage, UPGRADE_KEY, progress);
}
