import { SDF_INFINITE, type HandlingConfig } from '../../input/config';
import type { ReplayData } from '../../replay/replay';
import type { SessionStats } from '../finesse/session';

export const TRIAL_LENGTHS = [20, 40, 60] as const;
export const DEFAULT_TRIAL_PIECES = 40;

/** One timed attempt: fixed handling, fixed seed, ends after `pieces` placements. */
export interface TrialSpec {
  readonly label: string;
  readonly handling: HandlingConfig;
  readonly seed: number;
  readonly pieces: number;
  /** When set, the trial ends after clearing this many lines instead of after `pieces`. */
  readonly lines?: number;
  /** Repetition index when the same config is played several times (calibration). */
  readonly round?: number;
}

export interface TrialResult {
  readonly label: string;
  readonly handling: HandlingConfig;
  readonly pieces: number;
  readonly durationMs: number;
  readonly pps: number;
  readonly kpp: number;
  readonly faults: number;
  readonly finessePct: number;
  /** Clean pieces per second: PPS x finesse rate. Rewards speed only when it stays accurate. */
  readonly score: number;
  readonly replay: ReplayData;
  readonly round?: number;
}

export function trialScore(stats: Pick<SessionStats, 'pps' | 'finessePct'>): number {
  return stats.pps * (stats.finessePct / 100);
}

export function toTrialResult(spec: TrialSpec, stats: SessionStats, replay: ReplayData): TrialResult {
  return {
    label: spec.label,
    handling: spec.handling,
    pieces: stats.pieces,
    durationMs: stats.durationMs,
    pps: stats.pps,
    kpp: stats.kpp,
    faults: stats.faults,
    finessePct: stats.finessePct,
    score: trialScore(stats),
    replay,
    ...(spec.round !== undefined ? { round: spec.round } : {}),
  };
}

export function sameHandling(a: HandlingConfig, b: HandlingConfig): boolean {
  return a.dasMs === b.dasMs && a.arrMs === b.arrMs && a.dcdMs === b.dcdMs && a.sdf === b.sdf;
}

export function formatHandling(h: HandlingConfig): string {
  return `DAS ${h.dasMs} · ARR ${h.arrMs} · DCD ${h.dcdMs} · SDF ${h.sdf === SDF_INFINITE ? '∞' : h.sdf}`;
}
