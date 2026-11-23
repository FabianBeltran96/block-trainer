import { mulberry32 } from '../../engine';
import { parsePatternKey, type Pattern } from './patterns';

/** Outcomes kept per pattern; old mistakes fade out once you fix them. */
export const RECENT_WINDOW = 20;
export const DRILL_PATTERNS = 5;
export const DRILL_LENGTHS = [20, 40] as const;

export interface PatternStats {
  readonly attempts: number;
  readonly faults: number;
  /** Last RECENT_WINDOW outcomes, newest last: '1' = fault, '0' = clean. */
  readonly recent: string;
}

export type WeakSpotStats = Readonly<Record<string, PatternStats>>;

export interface WeakSpot {
  readonly pattern: Pattern;
  readonly stats: PatternStats;
  readonly recentFaults: number;
  readonly recentAttempts: number;
  /** Smoothed recent fault rate (0..1); a single lucky or unlucky piece does not dominate. */
  readonly weakness: number;
}

export function recordOutcome(
  stats: WeakSpotStats,
  pattern: Pattern,
  fault: boolean,
): WeakSpotStats {
  const prev = stats[pattern.key];
  return {
    ...stats,
    [pattern.key]: {
      attempts: (prev?.attempts ?? 0) + 1,
      faults: (prev?.faults ?? 0) + (fault ? 1 : 0),
      recent: `${prev?.recent ?? ''}${fault ? '1' : '0'}`.slice(-RECENT_WINDOW),
    },
  };
}

function countFaults(recent: string): number {
  let n = 0;
  for (const ch of recent) if (ch === '1') n++;
  return n;
}

/** Patterns with at least one recent fault, weakest first. */
export function rankWeakSpots(stats: WeakSpotStats): WeakSpot[] {
  const spots: WeakSpot[] = [];
  for (const [key, s] of Object.entries(stats)) {
    const pattern = parsePatternKey(key);
    const recentFaults = countFaults(s.recent);
    if (!pattern || recentFaults === 0) continue;
    const recentAttempts = s.recent.length;
    spots.push({ pattern, stats: s, recentFaults, recentAttempts, weakness: (recentFaults + 1) / (recentAttempts + 2) });
  }
  return spots.sort((a, b) => b.weakness - a.weakness || b.recentFaults - a.recentFaults);
}

export function totals(stats: WeakSpotStats): { attempts: number; faults: number; patterns: number } {
  let attempts = 0;
  let faults = 0;
  for (const s of Object.values(stats)) {
    attempts += s.attempts;
    faults += s.faults;
  }
  return { attempts, faults, patterns: Object.keys(stats).length };
}

/**
 * Drill order: shuffled rounds over the chosen patterns, so each one comes back regularly
 * without a predictable cycle. Deterministic for a given seed (replays rebuild it).
 */
export function buildDrill(patterns: readonly Pattern[], reps: number, seed: number): Pattern[] {
  if (patterns.length === 0) return [];
  const random = mulberry32(seed);
  const order: Pattern[] = [];
  while (order.length < reps) {
    const round = [...patterns];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [round[i], round[j]] = [round[j]!, round[i]!];
    }
    // Avoid the same pattern twice in a row across rounds.
    if (round.length > 1 && round[0]!.key === order.at(-1)?.key) round.push(round.shift()!);
    order.push(...round);
  }
  return order.slice(0, reps);
}

export interface DrillSummary {
  readonly date: string;
  readonly reps: number;
  readonly clean: number;
  readonly patterns: readonly { readonly key: string; readonly attempts: number; readonly clean: number }[];
}

export function summarizeDrill(targets: readonly Pattern[], clean: readonly boolean[], date: Date = new Date()): DrillSummary {
  const per = new Map<string, { key: string; attempts: number; clean: number }>();
  clean.forEach((ok, i) => {
    const key = targets[i]!.key;
    const entry = per.get(key) ?? { key, attempts: 0, clean: 0 };
    per.set(key, { key, attempts: entry.attempts + 1, clean: entry.clean + (ok ? 1 : 0) });
  });
  return {
    date: date.toISOString(),
    reps: clean.length,
    clean: clean.filter(Boolean).length,
    patterns: [...per.values()],
  };
}
