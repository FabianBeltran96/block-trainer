import {
  Board,
  BOARD_WIDTH,
  dropPiece,
  pieceCells,
  shapeCells,
  spawnPiece,
  type Cell,
  type PieceType,
  type Rotation,
} from '../../engine';
import { solveFinesse, type FinesseSolution } from '../finesse/solver';

/**
 * A finesse pattern: which piece, in which orientation, landing at which column. Rotations
 * that produce the same shape (S/Z/I flat or vertical, any O) share one canonical orientation,
 * so a pattern means "this shape at this spot" no matter how it was reached.
 */
export interface Pattern {
  readonly key: string;
  readonly type: PieceType;
  readonly orientation: Rotation;
  /** 0-based leftmost column the piece occupies. */
  readonly column: number;
}

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

function normalized(cells: readonly Cell[]): string {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells
    .map(([x, y]) => (y - minY) * 10 + (x - minX))
    .sort((a, b) => a - b)
    .join(',');
}

function canonicalOrientation(type: PieceType, cells: readonly Cell[]): Rotation {
  const shape = normalized(cells);
  return ROTATIONS.find((r) => normalized(shapeCells(type, r)) === shape) ?? 0;
}

export function patternKey(type: PieceType, orientation: Rotation, column: number): string {
  return `${type}:${orientation}:${column}`;
}

export function makePattern(type: PieceType, orientation: Rotation, column: number): Pattern {
  return { key: patternKey(type, orientation, column), type, orientation, column };
}

export function patternOf(type: PieceType, cells: readonly Cell[]): Pattern {
  return makePattern(type, canonicalOrientation(type, cells), Math.min(...cells.map(([x]) => x)));
}

export function parsePatternKey(key: string): Pattern | null {
  const [type, orientation, column] = key.split(':');
  const o = Number(orientation);
  const c = Number(column);
  if (!type || !'IJLOSTZ'.includes(type) || type.length !== 1) return null;
  if (!ROTATIONS.includes(o as Rotation) || !Number.isInteger(c) || c < 0 || c >= BOARD_WIDTH) return null;
  return makePattern(type as PieceType, o as Rotation, c);
}

/** Cells the pattern occupies after a hard drop on an empty board. */
export function targetCells(pattern: Pattern): Cell[] {
  const minCx = Math.min(...shapeCells(pattern.type, pattern.orientation).map(([cx]) => cx));
  const piece = { ...spawnPiece(pattern.type), rotation: pattern.orientation, x: pattern.column - minCx };
  return pieceCells(dropPiece(new Board(), piece));
}

function orientationLabel(pattern: Pattern): string {
  switch (pattern.type) {
    case 'O':
      return '';
    case 'I':
    case 'S':
    case 'Z':
      return pattern.orientation === 0 ? 'flat' : 'vertical';
    default:
      return ['spawn', 'CW', '180', 'CCW'][pattern.orientation]!;
  }
}

/** e.g. "T CW · cols 4-5" (columns are 1-based for display). */
export function describePattern(pattern: Pattern): string {
  const width = new Set(shapeCells(pattern.type, pattern.orientation).map(([cx]) => cx)).size;
  const from = pattern.column + 1;
  const columns = width === 1 ? `col ${from}` : `cols ${from}-${from + width - 1}`;
  const orientation = orientationLabel(pattern);
  return `${pattern.type}${orientation ? ` ${orientation}` : ''} · ${columns}`;
}

/** Minimal inputs for the pattern on an empty board: the canonical finesse to learn. */
export function patternSolution(pattern: Pattern, allow180: boolean): FinesseSolution | null {
  return solveFinesse(new Board(), pattern.type, targetCells(pattern), { allow180 });
}
