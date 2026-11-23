import { SDF_INFINITE, type HandlingConfig } from '../../input/config';
import type { ReplayData } from '../../replay/replay';
import type { TrialResult } from './trial';

export interface UpgradeLevel {
  readonly name: string;
  readonly handling: HandlingConfig;
}

/** Ladder from relaxed to competitive handling. Each step changes one or two values only. */
export const UPGRADE_LADDER: readonly UpgradeLevel[] = [
  { name: 'Starter', handling: { dasMs: 167, arrMs: 33, dcdMs: 33, sdf: 20 } },
  { name: 'Smooth', handling: { dasMs: 150, arrMs: 17, dcdMs: 33, sdf: SDF_INFINITE } },
  { name: 'Steady', handling: { dasMs: 133, arrMs: 17, dcdMs: 17, sdf: SDF_INFINITE } },
  { name: 'Instant', handling: { dasMs: 133, arrMs: 0, dcdMs: 17, sdf: SDF_INFINITE } },
  { name: 'Quick', handling: { dasMs: 117, arrMs: 0, dcdMs: 17, sdf: SDF_INFINITE } },
  { name: 'Sharp', handling: { dasMs: 100, arrMs: 0, dcdMs: 0, sdf: SDF_INFINITE } },
  { name: 'Competitive', handling: { dasMs: 83, arrMs: 0, dcdMs: 0, sdf: SDF_INFINITE } },
];

/** Minimum finesse to pass a level. */
export const PASS_FINESSE_PCT = 90;
/** Minimum PPS as a fraction of the best PPS on the previous level: faster settings must not slow you down. */
export const PASS_PPS_RATIO = 0.95;

export interface UpgradeAttempt {
  readonly level: number;
  readonly pps: number;
  readonly finessePct: number;
  readonly passed: boolean;
  readonly reason: string;
  readonly replay: ReplayData;
}

export interface UpgradeProgress {
  /** Level the player starts from (matches their handling when progress was created). */
  readonly startLevel: number;
  /** Highest level the player may attempt. Levels below it are passed. */
  readonly unlocked: number;
  /** Best PPS achieved on each level while passing finesse, or null. */
  readonly bestPps: readonly (number | null)[];
  readonly lastAttempt: UpgradeAttempt | null;
}

/** Starts at the fastest level that is still not faster than the player's current handling. */
export function initialProgress(current: HandlingConfig): UpgradeProgress {
  let start = 0;
  UPGRADE_LADDER.forEach((level, i) => {
    if (level.handling.dasMs >= current.dasMs && level.handling.arrMs >= current.arrMs) start = i;
  });
  return { startLevel: start, unlocked: start, bestPps: UPGRADE_LADDER.map(() => null), lastAttempt: null };
}

export function isLadderComplete(progress: UpgradeProgress): boolean {
  return progress.bestPps[UPGRADE_LADDER.length - 1] !== null && progress.unlocked === UPGRADE_LADDER.length - 1;
}

/** Fastest handling the player has passed, or null when nothing passed yet. */
export function highestPassed(progress: UpgradeProgress): UpgradeLevel | null {
  for (let i = UPGRADE_LADDER.length - 1; i >= 0; i--) if (progress.bestPps[i] !== null) return UPGRADE_LADDER[i]!;
  return null;
}

export function requiredPps(progress: UpgradeProgress, level: number): number | null {
  if (level <= progress.startLevel) return null;
  const previous = progress.bestPps[level - 1];
  return previous == null ? null : previous * PASS_PPS_RATIO;
}

export function recordAttempt(progress: UpgradeProgress, level: number, result: TrialResult): UpgradeProgress {
  const minPps = requiredPps(progress, level);
  const finesseOk = result.finessePct >= PASS_FINESSE_PCT;
  const speedOk = minPps === null || result.pps >= minPps;
  const passed = finesseOk && speedOk;
  const reasons: string[] = [];
  if (!finesseOk) reasons.push(`finesse ${result.finessePct.toFixed(1)}% < ${PASS_FINESSE_PCT}%`);
  if (!speedOk && minPps !== null) reasons.push(`PPS ${result.pps.toFixed(2)} < ${minPps.toFixed(2)}`);

  const bestPps = [...progress.bestPps];
  if (passed) bestPps[level] = Math.max(bestPps[level] ?? 0, result.pps);
  const unlocked =
    passed && level === progress.unlocked ? Math.min(level + 1, UPGRADE_LADDER.length - 1) : progress.unlocked;

  return {
    ...progress,
    unlocked,
    bestPps,
    lastAttempt: {
      level,
      pps: result.pps,
      finessePct: result.finessePct,
      passed,
      reason: passed ? 'Passed.' : `Not yet: ${reasons.join(', ')}.`,
      replay: result.replay,
    },
  };
}
