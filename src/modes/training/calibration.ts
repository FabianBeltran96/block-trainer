import { mulberry32 } from '../../engine/rng';
import type { HandlingConfig } from '../../input/config';
import { sameHandling, type TrialResult, type TrialSpec } from './trial';

/**
 * Candidate DAS/ARR/DCD profiles, from relaxed to aggressive. SDF is kept from the player's
 * current settings so the comparison isolates horizontal handling.
 */
const CANDIDATES: readonly Omit<HandlingConfig, 'sdf'>[] = [
  { dasMs: 167, arrMs: 33, dcdMs: 33 },
  { dasMs: 133, arrMs: 17, dcdMs: 17 },
  { dasMs: 117, arrMs: 0, dcdMs: 17 },
  { dasMs: 100, arrMs: 0, dcdMs: 0 },
];

export const CALIBRATION_REPS = [1, 2, 3] as const;
export const DEFAULT_CALIBRATION_REPS = 2;

/**
 * The calibration is played in rounds. Within a round every config gets the same seed (same
 * piece sequence) so results are comparable; each round has its own seed so you cannot learn
 * the queue. Order is reshuffled per round so warm-up and fatigue do not always favor the same
 * config, and configs are shown as letters until the results, to keep the test blind.
 */
export interface CalibrationRun {
  readonly seed: number;
  readonly pieces: number;
  /** Attempts per config; results are averaged. */
  readonly reps: number;
  /** Flattened rounds: every config once per round, in play order. */
  readonly trials: readonly TrialSpec[];
  readonly results: readonly TrialResult[];
  /** Labels of configs skipped or discarded by the player: they never count for the ranking. */
  readonly excluded: readonly string[];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export function roundSeed(seed: number, round: number): number {
  return (seed + Math.imul(round, 0x6d2b79f5)) >>> 0;
}

export function createCalibration(current: HandlingConfig, pieces: number, seed: number, reps = 1): CalibrationRun {
  const configs: HandlingConfig[] = [current];
  for (const candidate of CANDIDATES) {
    const config = { ...candidate, sdf: current.sdf };
    if (!configs.some((c) => sameHandling(c, config))) configs.push(config);
  }
  const random = mulberry32(seed ^ 0x9e3779b9);
  const labeled = shuffle([...configs], random).map((handling, i) => ({ label: `Config ${String.fromCharCode(65 + i)}`, handling }));
  const trials: TrialSpec[] = [];
  for (let round = 0; round < reps; round++) {
    const order = round === 0 ? labeled : shuffle([...labeled], random);
    for (const { label, handling } of order) trials.push({ label, handling, seed: roundSeed(seed, round), pieces, round });
  }
  return { seed, pieces, reps, trials, results: [], excluded: [] };
}

const sameTrial = (r: TrialResult, t: TrialSpec) => r.label === t.label && (r.round ?? 0) === (t.round ?? 0);

const isResolved = (run: CalibrationRun, trial: TrialSpec): boolean =>
  run.excluded.includes(trial.label) || run.results.some((r) => sameTrial(r, trial));

export function nextCalibrationTrial(run: CalibrationRun): TrialSpec | null {
  return run.trials.find((t) => !isResolved(run, t)) ?? null;
}

export function isCalibrationDone(run: CalibrationRun): boolean {
  return run.trials.every((t) => isResolved(run, t));
}

/** Number of trials already played or skipped. */
export function resolvedCount(run: CalibrationRun): number {
  return run.trials.filter((t) => isResolved(run, t)).length;
}

/** Skips a config (before or during play) or discards a played one; calling again restores it. */
export function toggleExcluded(run: CalibrationRun, label: string): CalibrationRun {
  const excluded = run.excluded.includes(label)
    ? run.excluded.filter((l) => l !== label)
    : [...run.excluded, label];
  return { ...run, excluded };
}

/** All attempts of one config, averaged. */
export interface ConfigSummary {
  readonly label: string;
  readonly handling: HandlingConfig;
  readonly attempts: readonly TrialResult[];
  readonly pps: number;
  readonly finessePct: number;
  readonly kpp: number;
  readonly score: number;
  readonly scoreMin: number;
  readonly scoreMax: number;
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function summarize(label: string, attempts: TrialResult[]): ConfigSummary {
  const scores = attempts.map((a) => a.score);
  return {
    label,
    handling: attempts[0]!.handling,
    attempts: [...attempts].sort((a, b) => (a.round ?? 0) - (b.round ?? 0)),
    pps: mean(attempts.map((a) => a.pps)),
    finessePct: mean(attempts.map((a) => a.finessePct)),
    kpp: mean(attempts.map((a) => a.kpp)),
    score: mean(scores),
    scoreMin: Math.min(...scores),
    scoreMax: Math.max(...scores),
  };
}

/** Played configs that count, best average score first, plus the discarded ones. */
export function rankResults(run: CalibrationRun): { ranked: ConfigSummary[]; discarded: ConfigSummary[] } {
  const byLabel = new Map<string, TrialResult[]>();
  for (const r of run.results) byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]);
  const summaries = [...byLabel].map(([label, attempts]) => summarize(label, attempts));
  return {
    ranked: summaries.filter((s) => !run.excluded.includes(s.label)).sort((a, b) => b.score - a.score),
    discarded: summaries.filter((s) => run.excluded.includes(s.label)),
  };
}

export type Confidence = 'single' | 'clear' | 'noise';

/**
 * Whether the winner is really better: with several attempts, its worst score must beat the
 * runner-up's best score. Overlapping ranges mean the gap is within your own variance.
 */
export function winnerConfidence(ranked: readonly ConfigSummary[]): Confidence {
  const [best, second] = ranked;
  if (!best || !second) return 'clear';
  if (best.attempts.length < 2 || second.attempts.length < 2) return 'single';
  return best.scoreMin > second.scoreMax ? 'clear' : 'noise';
}
