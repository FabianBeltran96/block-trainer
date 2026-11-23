import { ENGINE_VERSION, PIECE_TYPES, type GravityConfig, type PieceType } from '../engine';
import { isGameAction } from '../input/actions';
import { sanitizeHandling, type HandlingConfig } from '../input/config';
import { Simulation, type InputRecord, type SimulationListener } from './simulation';

export const REPLAY_FORMAT = 'block-trainer-replay';
export const REPLAY_FORMAT_VERSION = 1;

export interface ReplayData {
  readonly format: typeof REPLAY_FORMAT;
  readonly formatVersion: number;
  readonly engineVersion: string;
  readonly id: string;
  readonly createdAt: string;
  readonly seed: number;
  readonly handling: HandlingConfig;
  readonly gravity: GravityConfig;
  readonly allow180: boolean;
  readonly durationMs: number;
  readonly pieces: number;
  readonly inputs: readonly InputRecord[];
  readonly drillQueue?: readonly PieceType[];
}

export function createReplay(simulation: Simulation, createdAt: Date = new Date()): ReplayData {
  const { seed, handling, gravity, allow180, drillQueue } = simulation.config;
  return {
    ...(drillQueue ? { drillQueue: [...drillQueue] } : {}),
    format: REPLAY_FORMAT,
    formatVersion: REPLAY_FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    id: `${createdAt.getTime().toString(36)}-${(seed >>> 0).toString(36)}`,
    createdAt: createdAt.toISOString(),
    seed,
    handling,
    gravity,
    allow180,
    durationMs: simulation.now,
    pieces: simulation.placements.length,
    inputs: [...simulation.inputs],
  };
}

function fail(message: string): never {
  throw new Error(`Invalid replay: ${message}`);
}

/** Validates untrusted JSON (imports, storage) into a ReplayData. Throws on bad input. */
export function parseReplay(value: unknown): ReplayData {
  if (typeof value !== 'object' || value === null) fail('not an object');
  const raw = value as Record<string, unknown>;
  if (raw.format !== REPLAY_FORMAT) fail('unknown format');
  if (typeof raw.seed !== 'number' || !Number.isInteger(raw.seed)) fail('missing seed');
  if (!Array.isArray(raw.inputs)) fail('missing inputs');
  let last = 0;
  const inputs = raw.inputs.map((entry: unknown, i): InputRecord => {
    const e = (entry ?? {}) as Record<string, unknown>;
    if (typeof e.t !== 'number' || !Number.isFinite(e.t) || e.t < last) fail(`input ${i} has a bad time`);
    if (e.phase !== 'down' && e.phase !== 'up') fail(`input ${i} has a bad phase`);
    if (!isGameAction(e.action)) fail(`input ${i} has an unknown action`);
    last = e.t;
    return { t: e.t, phase: e.phase, action: e.action };
  });
  const gravityRaw = (raw.gravity ?? {}) as Record<string, unknown>;
  return {
    format: REPLAY_FORMAT,
    formatVersion: typeof raw.formatVersion === 'number' ? raw.formatVersion : REPLAY_FORMAT_VERSION,
    engineVersion: typeof raw.engineVersion === 'string' ? raw.engineVersion : 'unknown',
    id: typeof raw.id === 'string' ? raw.id : `import-${Date.now().toString(36)}`,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    seed: raw.seed,
    handling: sanitizeHandling(raw.handling),
    gravity: {
      enabled: gravityRaw.enabled === true,
      rowsPerSecond: typeof gravityRaw.rowsPerSecond === 'number' ? gravityRaw.rowsPerSecond : 1,
    },
    allow180: raw.allow180 !== false,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : last,
    pieces: typeof raw.pieces === 'number' ? raw.pieces : 0,
    inputs,
    ...parseDrillQueue(raw.drillQueue),
  };
}

function parseDrillQueue(value: unknown): { drillQueue?: PieceType[] } {
  if (value === undefined) return {};
  if (!Array.isArray(value) || !value.every((p) => PIECE_TYPES.includes(p as PieceType))) fail('bad drill queue');
  return { drillQueue: value as PieceType[] };
}

export function simulationFor(replay: ReplayData, listener?: SimulationListener): Simulation {
  const { seed, handling, gravity, allow180, drillQueue } = replay;
  return new Simulation({ seed, handling, gravity, allow180, ...(drillQueue ? { drillQueue } : {}) }, listener);
}

/** Replays everything instantly and returns the finished simulation. */
export function runReplay(replay: ReplayData): Simulation {
  const simulation = simulationFor(replay);
  for (const input of replay.inputs) simulation.input(input.phase, input.action, input.t);
  simulation.advanceTo(replay.durationMs);
  return simulation;
}

/** Real-time playback at an adjustable speed, with pause and seeking. Call `step` from the frame loop. */
export class ReplayPlayer {
  private sim: Simulation;
  private clock = 0;
  private cursor = 0;
  private muted = false;
  paused = false;

  constructor(
    readonly replay: ReplayData,
    public speed = 1,
    private readonly listener?: SimulationListener,
  ) {
    this.sim = this.createSimulation();
  }

  get simulation(): Simulation {
    return this.sim;
  }

  get time(): number {
    return this.clock;
  }

  get done(): boolean {
    return this.cursor >= this.replay.inputs.length && this.clock >= this.replay.durationMs;
  }

  get progress(): number {
    return this.replay.durationMs > 0 ? Math.min(1, this.clock / this.replay.durationMs) : 1;
  }

  step(realDtMs: number): void {
    if (this.paused || this.done) return;
    this.advance(Math.min(this.replay.durationMs, this.clock + realDtMs * this.speed));
  }

  /**
   * Jumps to `timeMs`. Going back rebuilds the run from the start: the simulation is
   * deterministic, so re-feeding the inputs reproduces the exact same state.
   * Events crossed while seeking are not reported to the listener.
   */
  seek(timeMs: number): void {
    const target = Math.max(0, Math.min(this.replay.durationMs, timeMs));
    if (target < this.clock) {
      this.sim = this.createSimulation();
      this.clock = 0;
      this.cursor = 0;
    }
    this.muted = true;
    this.advance(target);
    this.muted = false;
  }

  private advance(target: number): void {
    this.clock = target;
    const inputs = this.replay.inputs;
    while (this.cursor < inputs.length && inputs[this.cursor]!.t <= this.clock) {
      const input = inputs[this.cursor++]!;
      this.sim.input(input.phase, input.action, input.t);
    }
    this.sim.advanceTo(this.clock);
  }

  private createSimulation(): Simulation {
    return simulationFor(this.replay, (event, verdict) => {
      if (!this.muted) this.listener?.(event, verdict);
    });
  }
}
