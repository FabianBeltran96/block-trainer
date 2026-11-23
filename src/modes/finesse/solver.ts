import {
  Board,
  dropPiece,
  fits,
  pieceCells,
  shiftToWall,
  spawnPiece,
  tryRotate,
  tryShift,
  type ActivePiece,
  type Cell,
  type PieceType,
} from '../../engine';

export type FinesseAction = 'tapLeft' | 'tapRight' | 'dasLeft' | 'dasRight' | 'cw' | 'ccw' | 'r180';

export const FINESSE_ACTION_LABEL: Readonly<Record<FinesseAction, string>> = {
  tapLeft: 'left',
  tapRight: 'right',
  dasLeft: 'DAS left',
  dasRight: 'DAS right',
  cw: 'CW',
  ccw: 'CCW',
  r180: '180',
};

export interface FinesseSolution {
  /** Minimum number of inputs (hard drop not counted). */
  readonly inputs: number;
  readonly sequence: readonly FinesseAction[];
}

export interface FinesseOptions {
  /** Whether 180-degree rotation counts as a single available input. */
  readonly allow180: boolean;
}

const BASE_ACTIONS: readonly FinesseAction[] = ['cw', 'ccw', 'tapLeft', 'tapRight', 'dasLeft', 'dasRight'];

/** Canonical key for a set of cells (order independent). */
export function placementKey(cells: readonly Cell[]): string {
  return cells
    .map(([x, y]) => y * 100 + x)
    .sort((a, b) => a - b)
    .join(',');
}

function applyAction(board: Board, piece: ActivePiece, action: FinesseAction): ActivePiece | null {
  switch (action) {
    case 'tapLeft':
      return tryShift(board, piece, -1);
    case 'tapRight':
      return tryShift(board, piece, 1);
    case 'dasLeft':
      return shiftToWall(board, piece, -1);
    case 'dasRight':
      return shiftToWall(board, piece, 1);
    case 'cw':
      return tryRotate(board, piece, 'cw')?.piece ?? null;
    case 'ccw':
      return tryRotate(board, piece, 'ccw')?.piece ?? null;
    case 'r180':
      return tryRotate(board, piece, '180')?.piece ?? null;
  }
}

const stateKey = (p: ActivePiece) => `${p.x},${p.y},${p.rotation}`;

/**
 * Breadth-first search over inputs at spawn height (no gravity, no soft drop) for the
 * fewest inputs whose hard-drop result occupies exactly `targetCells`.
 * Returns null when the placement is not reachable that way (e.g. tucks or soft-drop spins).
 */
export function solveFinesse(
  board: Board,
  type: PieceType,
  targetCells: readonly Cell[],
  options: FinesseOptions = { allow180: true },
): FinesseSolution | null {
  const start = spawnPiece(type);
  if (!fits(board, start)) return null;
  const target = placementKey(targetCells);
  const actions = options.allow180 ? [...BASE_ACTIONS, 'r180' as const] : BASE_ACTIONS;

  interface Node {
    readonly piece: ActivePiece;
    readonly sequence: readonly FinesseAction[];
  }
  const visited = new Set<string>([stateKey(start)]);
  const queue: Node[] = [{ piece: start, sequence: [] }];

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    if (placementKey(pieceCells(dropPiece(board, node.piece))) === target) {
      return { inputs: node.sequence.length, sequence: node.sequence };
    }
    for (const action of actions) {
      const next = applyAction(board, node.piece, action);
      if (!next) continue;
      const key = stateKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ piece: next, sequence: [...node.sequence, action] });
    }
  }
  return null;
}
