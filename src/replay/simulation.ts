import { Engine, type EngineEvent, type GravityConfig, type PiecePlacedEvent, type PieceType } from '../engine';
import type { GameAction } from '../input/actions';
import type { HandlingConfig } from '../input/config';
import { HandlingController } from '../input/controller';
import { FinesseSession } from '../modes/finesse/session';
import type { FinesseVerdict } from '../modes/finesse/verdict';

export interface RunConfig {
  readonly seed: number;
  readonly handling: HandlingConfig;
  readonly gravity: GravityConfig;
  readonly allow180: boolean;
  /**
   * Isolated-placement drill: these pieces are dealt first, the board is emptied after
   * every placement and hold is disabled.
   */
  readonly drillQueue?: readonly PieceType[];
}

export type InputPhase = 'down' | 'up';

/** One recorded key transition; `t` is integer ms since the start of the run. */
export interface InputRecord {
  readonly t: number;
  readonly phase: InputPhase;
  readonly action: GameAction;
}

export type SimulationListener = (event: EngineEvent, verdict: FinesseVerdict | null) => void;

/**
 * A single run: engine + handling + finesse session driven by a fixed 1 ms clock.
 * Inputs are quantized to whole ms and applied after that ms has been simulated, so feeding
 * the same input list always produces the same game, regardless of frame timing.
 */
export class Simulation {
  readonly engine: Engine;
  readonly controller: HandlingController;
  readonly session: FinesseSession;
  readonly inputs: InputRecord[] = [];
  readonly placements: PiecePlacedEvent[] = [];
  private nowMs = 0;

  constructor(
    readonly config: RunConfig,
    private readonly listener?: SimulationListener,
  ) {
    const drill = config.drillQueue;
    this.engine = new Engine({
      seed: config.seed,
      gravity: config.gravity,
      ...(drill ? { forcedQueue: drill, resetBoardOnLock: true, holdEnabled: false } : {}),
    });
    this.controller = new HandlingController(this.engine, config.handling);
    this.session = new FinesseSession({ allow180: config.allow180 });
    this.flush();
  }

  get now(): number {
    return this.nowMs;
  }

  get finished(): boolean {
    return this.engine.isGameOver();
  }

  /** Simulates every millisecond up to `timeMs` (inclusive, floored). */
  advanceTo(timeMs: number): void {
    const target = Math.floor(timeMs);
    while (this.nowMs < target && !this.finished) {
      this.nowMs++;
      this.controller.update(this.nowMs);
      this.engine.tick(1);
      this.flush();
    }
    if (this.finished && this.nowMs < target) this.nowMs = target;
  }

  /** Applies a key transition at `timeMs` (never earlier than the current clock) and records it. */
  input(phase: InputPhase, action: GameAction, timeMs: number): void {
    if (this.finished) return;
    const at = Math.max(Math.round(timeMs), this.nowMs);
    this.advanceTo(at);
    if (this.finished) return;
    this.inputs.push({ t: at, phase, action });
    if (phase === 'down') {
      this.session.registerKeyPress(at);
      this.controller.press(action, at);
    } else {
      this.controller.release(action, at);
    }
    this.flush();
  }

  /** Forget held keys (window blur). Recorded as key-ups so replays stay in sync. */
  releaseAll(timeMs: number, held: Iterable<GameAction>): void {
    for (const action of held) this.input('up', action, timeMs);
  }

  private flush(): void {
    for (const event of this.engine.drainEvents()) {
      const verdict = this.session.handle(event, this.nowMs);
      if (event.type === 'piecePlaced') this.placements.push(event);
      this.listener?.(event, verdict);
    }
  }
}
