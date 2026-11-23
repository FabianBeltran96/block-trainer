import { Board } from './board';
import { dropDistance, dropPiece, fits, isGrounded, shiftToWall, tryRotate, tryShift } from './movement';
import { pieceCells, pieceId, spawnPiece } from './pieces';
import { SevenBag } from './rng';
import { detectTSpin } from './tspin';
import type {
  ActivePiece,
  EngineEvent,
  GravityConfig,
  PieceType,
  RotationDirection,
  SpinKind,
} from './types';

/** Bump when a rule change would make old replays diverge. */
export const ENGINE_VERSION = '1.0.0';

export const PREVIEW_COUNT = 5;
export const DEFAULT_LOCK_DELAY_MS = 500;
export const DEFAULT_MAX_LOCK_RESETS = 15;
export const GRAVITY_OFF: GravityConfig = { enabled: false, rowsPerSecond: 1 };

export interface EngineOptions {
  readonly seed: number;
  /** Pieces dealt before the 7-bag starts (useful for drills and tests). */
  readonly forcedQueue?: readonly PieceType[];
  readonly board?: Board;
  readonly gravity?: GravityConfig;
  readonly lockDelayMs?: number;
  readonly maxLockResets?: number;
  /** Empties the board after every placement (isolated single-piece drills). */
  readonly resetBoardOnLock?: boolean;
  readonly holdEnabled?: boolean;
}

export interface EngineSnapshot {
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly ghost: ActivePiece | null;
  readonly hold: PieceType | null;
  readonly holdUsed: boolean;
  readonly next: readonly PieceType[];
  readonly gameOver: boolean;
  readonly combo: number;
  readonly b2b: number;
}

/**
 * Pure, deterministic game engine. Commands mutate state; `tick` advances time;
 * events are collected and handed out through `drainEvents`.
 */
export class Engine {
  private readonly board: Board;
  private readonly bag: SevenBag;
  private readonly queue: PieceType[] = [];
  private readonly lockDelayMs: number;
  private readonly maxLockResets: number;
  private readonly resetBoardOnLock: boolean;
  private readonly holdEnabled: boolean;
  private gravity: GravityConfig;
  private events: EngineEvent[] = [];

  private active: ActivePiece | null = null;
  private holdPiece: PieceType | null = null;
  private holdUsed = false;
  private gameOver = false;
  private combo = -1;
  private b2b = -1;

  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private gravityAccumulator = 0;
  private inputCount = 0;
  private lastMoveWasRotation = false;
  private lastKickIndex = -1;
  private lastRotationDirection: RotationDirection | null = null;

  constructor(options: EngineOptions) {
    this.board = options.board ? options.board.clone() : new Board();
    this.bag = new SevenBag(options.seed);
    this.gravity = options.gravity ?? GRAVITY_OFF;
    this.lockDelayMs = options.lockDelayMs ?? DEFAULT_LOCK_DELAY_MS;
    this.maxLockResets = options.maxLockResets ?? DEFAULT_MAX_LOCK_RESETS;
    this.resetBoardOnLock = options.resetBoardOnLock ?? false;
    this.holdEnabled = options.holdEnabled ?? true;
    this.queue.push(...(options.forcedQueue ?? []));
    this.spawn(this.takeNext());
  }

  // ---- queries -------------------------------------------------------------

  snapshot(): EngineSnapshot {
    this.fillQueue();
    return {
      board: this.board,
      active: this.active,
      ghost: this.active ? dropPiece(this.board, this.active) : null,
      hold: this.holdPiece,
      holdUsed: this.holdUsed,
      next: this.queue.slice(0, PREVIEW_COUNT),
      gameOver: this.gameOver,
      combo: this.combo,
      b2b: this.b2b,
    };
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  drainEvents(): EngineEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  setGravity(gravity: GravityConfig): void {
    this.gravity = gravity;
    this.gravityAccumulator = 0;
  }

  // ---- commands ------------------------------------------------------------
  // `counted` marks a deliberate key press (used by finesse); auto-repeat passes false.

  moveLeft(counted = true): boolean {
    return this.shift(-1, counted);
  }

  moveRight(counted = true): boolean {
    return this.shift(1, counted);
  }

  shiftToWall(direction: -1 | 1, counted = false): boolean {
    const piece = this.active;
    if (!piece) return false;
    if (counted) this.inputCount++;
    const moved = shiftToWall(this.board, piece, direction);
    if (moved.x === piece.x) return false;
    this.applyMovement(moved, false);
    return true;
  }

  rotateCW(counted = true): boolean {
    return this.rotate('cw', counted);
  }

  rotateCCW(counted = true): boolean {
    return this.rotate('ccw', counted);
  }

  rotate180(counted = true): boolean {
    return this.rotate('180', counted);
  }

  /** Moves one row down. Never locks by itself. */
  softDrop(): boolean {
    const piece = this.active;
    if (!piece) return false;
    const moved = tryShift(this.board, piece, 0, 1);
    if (!moved) return false;
    this.applyFall(moved);
    return true;
  }

  /** Moves straight to the floor without locking ("infinite" soft drop). */
  sonicDrop(): boolean {
    const piece = this.active;
    if (!piece) return false;
    const distance = dropDistance(this.board, piece);
    if (distance === 0) return false;
    this.applyFall({ ...piece, y: piece.y + distance });
    return true;
  }

  hardDrop(): void {
    if (!this.active) return;
    this.sonicDrop();
    this.lock();
  }

  hold(): boolean {
    const piece = this.active;
    if (!piece || this.holdUsed || !this.holdEnabled) return false;
    const next = this.holdPiece ?? this.takeNext();
    this.holdPiece = piece.type;
    this.holdUsed = true;
    this.events.push({ type: 'hold', held: piece.type, next });
    this.spawn(next);
    return true;
  }

  /** Advances gravity and lock delay by `dtMs` milliseconds. */
  tick(dtMs: number): void {
    if (!this.active || dtMs <= 0) return;

    if (this.gravity.enabled && this.gravity.rowsPerSecond > 0) {
      const msPerRow = 1000 / this.gravity.rowsPerSecond;
      this.gravityAccumulator += dtMs;
      while (this.gravityAccumulator >= msPerRow && this.active) {
        this.gravityAccumulator -= msPerRow;
        if (!this.softDrop()) {
          this.gravityAccumulator = 0;
          break;
        }
      }
    }

    const piece = this.active;
    if (!piece) return;
    if (isGrounded(this.board, piece)) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= this.lockDelayMs) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  // ---- internals -----------------------------------------------------------

  private shift(dx: -1 | 1, counted: boolean): boolean {
    const piece = this.active;
    if (!piece) return false;
    if (counted) this.inputCount++;
    const moved = tryShift(this.board, piece, dx);
    if (!moved) return false;
    this.applyMovement(moved, false);
    return true;
  }

  private rotate(direction: RotationDirection, counted: boolean): boolean {
    const piece = this.active;
    if (!piece) return false;
    if (counted) this.inputCount++;
    const result = tryRotate(this.board, piece, direction);
    if (!result) return false;
    this.applyMovement(result.piece, true);
    this.lastKickIndex = result.kickIndex;
    this.lastRotationDirection = direction;
    return true;
  }

  /** Lateral move or rotation: may reset lock delay (limited by maxLockResets). */
  private applyMovement(next: ActivePiece, rotated: boolean): void {
    const wasGrounded = isGrounded(this.board, this.active!);
    this.active = next;
    this.lastMoveWasRotation = rotated;
    if (next.y > this.lowestY) {
      this.reachNewLowest(next.y);
    } else if (wasGrounded && this.lockResets < this.maxLockResets) {
      this.lockResets++;
      this.lockTimer = 0;
    }
  }

  private applyFall(next: ActivePiece): void {
    this.active = next;
    this.lastMoveWasRotation = false;
    if (next.y > this.lowestY) this.reachNewLowest(next.y);
  }

  private reachNewLowest(y: number): void {
    this.lowestY = y;
    this.lockResets = 0;
    this.lockTimer = 0;
  }

  private lock(): void {
    const piece = this.active;
    if (!piece) return;
    const boardBefore = new Uint8Array(this.board.cells);
    const cells = pieceCells(piece);
    const spin: SpinKind = detectTSpin(this.board, piece, {
      lastMoveWasRotation: this.lastMoveWasRotation,
      kickIndex: this.lastKickIndex,
      rotationDirection: this.lastRotationDirection,
    });

    const id = pieceId(piece.type);
    for (const [x, y] of cells) this.board.set(x, y, id);
    const rows = this.board.fullRows();
    this.board.clearRows(rows);
    const lines = rows.length;

    if (lines > 0) {
      this.combo++;
      const difficult = lines === 4 || spin !== 'none';
      this.b2b = difficult ? this.b2b + 1 : -1;
      this.events.push({ type: 'lineClear', lines, spin, combo: this.combo, b2b: this.b2b });
    } else {
      this.combo = -1;
    }
    if (spin !== 'none') this.events.push({ type: 'spin', kind: spin, piece: piece.type, lines });

    this.events.push({
      type: 'piecePlaced',
      piece: piece.type,
      x: piece.x,
      y: piece.y,
      rotation: piece.rotation,
      inputCount: this.inputCount,
      cells,
      spin,
      linesCleared: lines,
      boardBefore,
    });

    if (this.resetBoardOnLock) this.board.cells.fill(0);

    this.holdUsed = false;
    this.spawn(this.takeNext());
  }

  private spawn(type: PieceType): void {
    const piece = spawnPiece(type);
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = piece.y;
    this.gravityAccumulator = 0;
    this.inputCount = 0;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = -1;
    this.lastRotationDirection = null;
    if (!fits(this.board, piece)) {
      this.active = null;
      this.gameOver = true;
      this.events.push({ type: 'topOut', reason: 'blockOut' });
      return;
    }
    this.active = piece;
    this.events.push({ type: 'spawn', piece: type });
  }

  private takeNext(): PieceType {
    this.fillQueue();
    return this.queue.shift()!;
  }

  private fillQueue(): void {
    while (this.queue.length < PREVIEW_COUNT + 1) this.queue.push(this.bag.next());
  }
}
