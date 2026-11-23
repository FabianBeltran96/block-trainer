import type { ActivePiece, Cell, PieceType, Rotation, RotationDirection } from './types';

export const PIECE_TYPES: readonly PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

interface Shape {
  readonly size: number;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly states: readonly (readonly Cell[])[];
}

/** Spawn-state cells inside the bounding box (y-down), following the SRS "true rotation" layout. */
const SPAWN_CELLS: Record<PieceType, { size: number; cells: Cell[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

function rotateBoxClockwise(cells: readonly Cell[], size: number): Cell[] {
  return cells.map(([x, y]) => [size - 1 - y, x] as const);
}

function buildShape(type: PieceType): Shape {
  const { size, cells } = SPAWN_CELLS[type];
  const states: Cell[][] = [cells];
  for (let i = 1; i < 4; i++) states.push(rotateBoxClockwise(states[i - 1]!, size));
  // Spawn just above the visible field (rows 18-19 of a 40-row board), centered, left-biased.
  const spawnX = type === 'O' ? 4 : 3;
  const spawnY = type === 'I' ? 17 : 18;
  return { size, spawnX, spawnY, states };
}

const SHAPES = Object.fromEntries(PIECE_TYPES.map((t) => [t, buildShape(t)])) as Record<
  PieceType,
  Shape
>;

export function shapeCells(type: PieceType, rotation: Rotation): readonly Cell[] {
  return SHAPES[type].states[rotation]!;
}

export function pieceCells(piece: ActivePiece): Cell[] {
  return shapeCells(piece.type, piece.rotation).map(([cx, cy]) => [piece.x + cx, piece.y + cy] as const);
}

export function spawnPiece(type: PieceType): ActivePiece {
  const shape = SHAPES[type];
  return { type, x: shape.spawnX, y: shape.spawnY, rotation: 0 };
}

/** Board cell value used for a locked piece of this type (1..7). 0 is empty. */
export function pieceId(type: PieceType): number {
  return PIECE_TYPES.indexOf(type) + 1;
}

export function pieceFromId(id: number): PieceType | null {
  return PIECE_TYPES[id - 1] ?? null;
}

export function rotateState(rotation: Rotation, direction: RotationDirection): Rotation {
  const delta = direction === 'cw' ? 1 : direction === 'ccw' ? 3 : 2;
  return ((rotation + delta) % 4) as Rotation;
}
