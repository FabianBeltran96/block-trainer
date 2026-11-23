import type { EngineEvent } from '../../engine';
import type { FinesseOptions } from './solver';
import { evaluatePlacement, type FinesseVerdict } from './verdict';

export interface SessionStats {
  readonly pieces: number;
  readonly durationMs: number;
  readonly pps: number;
  readonly kpp: number;
  readonly faults: number;
  readonly evaluated: number;
  /** Percentage of evaluated pieces placed with optimal finesse (100 when none evaluated). */
  readonly finessePct: number;
}

/** Aggregates finesse results and pace metrics for one run. Time is simulation ms. */
export class FinesseSession {
  private pieces = 0;
  private keys = 0;
  private faults = 0;
  private evaluated = 0;
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private lastVerdict: FinesseVerdict | null = null;

  constructor(private readonly options: FinesseOptions) {}

  registerKeyPress(now: number): void {
    if (this.endedAt !== null) return;
    this.startedAt ??= now;
    this.keys++;
  }

  /** Returns the verdict when the event is a placement. */
  handle(event: EngineEvent, now: number): FinesseVerdict | null {
    if (event.type === 'topOut') this.end(now);
    if (event.type !== 'piecePlaced') return null;
    this.startedAt ??= now;
    this.pieces++;
    const verdict = evaluatePlacement(event, this.options);
    if (verdict.kind !== 'skipped') this.evaluated++;
    if (verdict.kind === 'fault') this.faults++;
    this.lastVerdict = verdict;
    return verdict;
  }

  end(now: number): void {
    this.endedAt ??= now;
  }

  get verdict(): FinesseVerdict | null {
    return this.lastVerdict;
  }

  stats(now: number): SessionStats {
    const end = this.endedAt ?? now;
    const durationMs = this.startedAt === null ? 0 : Math.max(0, end - this.startedAt);
    const seconds = durationMs / 1000;
    return {
      pieces: this.pieces,
      durationMs,
      pps: seconds > 0 ? this.pieces / seconds : 0,
      kpp: this.pieces > 0 ? this.keys / this.pieces : 0,
      faults: this.faults,
      evaluated: this.evaluated,
      finessePct: this.evaluated > 0 ? ((this.evaluated - this.faults) / this.evaluated) * 100 : 100,
    };
  }
}
