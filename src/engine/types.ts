export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

/** 0 = spawn, 1 = R (clockwise), 2 = 180, 3 = L (counter-clockwise). */
export type Rotation = 0 | 1 | 2 | 3;

export type RotationDirection = 'cw' | 'ccw' | '180';

/** Board coordinates: x grows to the right, y grows downward (row 0 is the top). */
export type Cell = readonly [x: number, y: number];

export interface ActivePiece {
  readonly type: PieceType;
  /** Left column of the piece bounding box. */
  readonly x: number;
  /** Top row of the piece bounding box. */
  readonly y: number;
  readonly rotation: Rotation;
}

export type SpinKind = 'none' | 'tspin' | 'tspin-mini';

export interface GravityConfig {
  readonly enabled: boolean;
  readonly rowsPerSecond: number;
}

export interface SpawnEvent {
  readonly type: 'spawn';
  readonly piece: PieceType;
}

export interface PiecePlacedEvent {
  readonly type: 'piecePlaced';
  readonly piece: PieceType;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  /** Counted inputs (taps and rotations) used for this piece since it spawned. */
  readonly inputCount: number;
  readonly cells: readonly Cell[];
  readonly spin: SpinKind;
  readonly linesCleared: number;
  /** Board as it was while the piece was in play (before locking). */
  readonly boardBefore: Uint8Array;
}

export interface LineClearEvent {
  readonly type: 'lineClear';
  readonly lines: number;
  readonly spin: SpinKind;
  readonly combo: number;
  readonly b2b: number;
}

export interface SpinEvent {
  readonly type: 'spin';
  readonly kind: Exclude<SpinKind, 'none'>;
  readonly piece: PieceType;
  readonly lines: number;
}

export interface HoldEvent {
  readonly type: 'hold';
  readonly held: PieceType;
  readonly next: PieceType;
}

export interface TopOutEvent {
  readonly type: 'topOut';
  readonly reason: 'blockOut';
}

export type EngineEvent =
  | SpawnEvent
  | PiecePlacedEvent
  | LineClearEvent
  | SpinEvent
  | HoldEvent
  | TopOutEvent;
