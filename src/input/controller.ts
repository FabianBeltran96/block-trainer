import type { GameAction } from './actions';
import { SDF_INFINITE, SOFT_DROP_BASE_ROWS_PER_SECOND, type HandlingConfig } from './config';

/** What the controller drives. The engine satisfies this structurally. */
export interface GameCommands {
  moveLeft(counted: boolean): boolean;
  moveRight(counted: boolean): boolean;
  shiftToWall(direction: -1 | 1, counted: boolean): boolean;
  softDrop(): boolean;
  sonicDrop(): boolean;
  hardDrop(): void;
  rotateCW(counted: boolean): boolean;
  rotateCCW(counted: boolean): boolean;
  rotate180(counted: boolean): boolean;
  hold(): boolean;
}

type Direction = -1 | 1;

/** Safety cap for catch-up loops (a board is only 10 wide / 40 tall). */
const MAX_REPEATS_PER_UPDATE = 40;

/**
 * Time-based handling (DAS / ARR / DCD / SDF). Pure logic: every call receives an
 * explicit timestamp in ms, so it is fully deterministic and testable.
 */
export class HandlingController {
  private config: HandlingConfig;
  private target: GameCommands;

  private readonly heldSince: Record<Direction, number | null> = { [-1]: null, [1]: null };
  private activeDirection: Direction | 0 = 0;
  private dasStart = 0;
  private nextRepeatAt = 0;
  private dcdUntil = Number.NEGATIVE_INFINITY;

  private softDropHeld = false;
  private nextSoftDropAt = 0;

  constructor(target: GameCommands, config: HandlingConfig) {
    this.target = target;
    this.config = config;
  }

  setConfig(config: HandlingConfig): void {
    this.config = config;
  }

  setTarget(target: GameCommands): void {
    this.target = target;
  }

  /** Forget all held keys (e.g. on window blur). */
  reset(): void {
    this.heldSince[-1] = null;
    this.heldSince[1] = null;
    this.activeDirection = 0;
    this.softDropHeld = false;
    this.dcdUntil = Number.NEGATIVE_INFINITY;
  }

  press(action: GameAction, now: number): void {
    switch (action) {
      case 'moveLeft':
        return this.pressDirection(-1, now);
      case 'moveRight':
        return this.pressDirection(1, now);
      case 'softDrop':
        return this.pressSoftDrop(now);
      case 'hardDrop':
        this.target.hardDrop();
        return this.applyDasCut(now);
      case 'rotateCW':
        this.target.rotateCW(true);
        return this.applyDasCut(now);
      case 'rotateCCW':
        this.target.rotateCCW(true);
        return this.applyDasCut(now);
      case 'rotate180':
        this.target.rotate180(true);
        return this.applyDasCut(now);
      case 'hold':
        this.target.hold();
        return this.applyDasCut(now);
    }
  }

  release(action: GameAction, now: number): void {
    if (action === 'moveLeft') this.releaseDirection(-1, now);
    else if (action === 'moveRight') this.releaseDirection(1, now);
    else if (action === 'softDrop') this.softDropHeld = false;
  }

  /** Runs auto-shift and soft drop repeats that are due at `now`. */
  update(now: number): void {
    this.updateAutoShift(now);
    this.updateSoftDrop(now);
  }

  private pressDirection(direction: Direction, now: number): void {
    if (this.heldSince[direction] !== null) return;
    this.heldSince[direction] = now;
    this.startDas(direction, now);
    this.move(direction, true);
    this.updateAutoShift(now);
  }

  private releaseDirection(direction: Direction, now: number): void {
    if (this.heldSince[direction] === null) return;
    this.updateAutoShift(now);
    this.heldSince[direction] = null;
    if (this.activeDirection !== direction) return;
    const other = -direction as Direction;
    if (this.heldSince[other] !== null) {
      // Last-pressed priority: fall back to the still-held direction with a fresh DAS.
      this.startDas(other, now);
    } else {
      this.activeDirection = 0;
    }
  }

  private startDas(direction: Direction, now: number): void {
    this.activeDirection = direction;
    this.dasStart = now;
    this.nextRepeatAt = now + this.config.dasMs;
  }

  private isDasCharged(now: number): boolean {
    return this.activeDirection !== 0 && now - this.dasStart >= this.config.dasMs;
  }

  private applyDasCut(now: number): void {
    if (this.isDasCharged(now)) this.dcdUntil = now + this.config.dcdMs;
  }

  private updateAutoShift(now: number): void {
    const direction = this.activeDirection;
    if (direction === 0) return;
    const chargedAt = this.dasStart + this.config.dasMs;
    const startAt = Math.max(chargedAt, this.dcdUntil);
    if (now < startAt) return;

    if (this.config.arrMs <= 0) {
      this.target.shiftToWall(direction, false);
      return;
    }
    if (this.nextRepeatAt < startAt) this.nextRepeatAt = startAt;
    let repeats = 0;
    while (this.nextRepeatAt <= now && repeats < MAX_REPEATS_PER_UPDATE) {
      this.move(direction, false);
      this.nextRepeatAt += this.config.arrMs;
      repeats++;
    }
    if (this.nextRepeatAt <= now) this.nextRepeatAt = now + this.config.arrMs;
  }

  private pressSoftDrop(now: number): void {
    if (this.softDropHeld) return;
    this.softDropHeld = true;
    if (this.config.sdf >= SDF_INFINITE) {
      this.target.sonicDrop();
      return;
    }
    this.target.softDrop();
    this.nextSoftDropAt = now + this.softDropIntervalMs();
  }

  private updateSoftDrop(now: number): void {
    if (!this.softDropHeld) return;
    if (this.config.sdf >= SDF_INFINITE) {
      this.target.sonicDrop();
      return;
    }
    const interval = this.softDropIntervalMs();
    let repeats = 0;
    while (this.nextSoftDropAt <= now && repeats < MAX_REPEATS_PER_UPDATE) {
      this.target.softDrop();
      this.nextSoftDropAt += interval;
      repeats++;
    }
    if (this.nextSoftDropAt <= now) this.nextSoftDropAt = now + interval;
  }

  private softDropIntervalMs(): number {
    return 1000 / (SOFT_DROP_BASE_ROWS_PER_SECOND * this.config.sdf);
  }

  private move(direction: Direction, counted: boolean): void {
    if (direction === -1) this.target.moveLeft(counted);
    else this.target.moveRight(counted);
  }
}
