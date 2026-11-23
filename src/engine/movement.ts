import type { Board } from './board';
import { getKicks } from './kicks';
import { pieceCells, rotateState } from './pieces';
import type { ActivePiece, RotationDirection } from './types';

export function fits(board: Board, piece: ActivePiece): boolean {
  return !board.collides(pieceCells(piece));
}

export function tryShift(board: Board, piece: ActivePiece, dx: number, dy = 0): ActivePiece | null {
  const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return fits(board, moved) ? moved : null;
}

/** Moves the piece horizontally as far as possible (ARR 0 behavior). */
export function shiftToWall(board: Board, piece: ActivePiece, direction: -1 | 1): ActivePiece {
  let current = piece;
  for (let next = tryShift(board, current, direction); next; next = tryShift(board, current, direction)) {
    current = next;
  }
  return current;
}

export function dropDistance(board: Board, piece: ActivePiece): number {
  let distance = 0;
  while (tryShift(board, piece, 0, distance + 1)) distance++;
  return distance;
}

export function dropPiece(board: Board, piece: ActivePiece): ActivePiece {
  return { ...piece, y: piece.y + dropDistance(board, piece) };
}

export function isGrounded(board: Board, piece: ActivePiece): boolean {
  return tryShift(board, piece, 0, 1) === null;
}

export interface RotationResult {
  readonly piece: ActivePiece;
  /** Index into the kick list that succeeded (0 = no kick). */
  readonly kickIndex: number;
}

export function tryRotate(board: Board, piece: ActivePiece, direction: RotationDirection): RotationResult | null {
  const to = rotateState(piece.rotation, direction);
  const kicks = getKicks(piece.type, piece.rotation, to);
  for (let i = 0; i < kicks.length; i++) {
    const [dx, dy] = kicks[i]!;
    const candidate: ActivePiece = { ...piece, rotation: to, x: piece.x + dx, y: piece.y + dy };
    if (fits(board, candidate)) return { piece: candidate, kickIndex: i };
  }
  return null;
}
