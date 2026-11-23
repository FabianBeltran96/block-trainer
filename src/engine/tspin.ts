import type { Board } from './board';
import type { ActivePiece, Rotation, RotationDirection, SpinKind } from './types';

const CORNERS = [
  [0, 0],
  [2, 0],
  [0, 2],
  [2, 2],
] as const;

/** Corners on the side the T is pointing at, per rotation state (indices into CORNERS). */
const FRONT_CORNERS: Record<Rotation, readonly [number, number]> = {
  0: [0, 1],
  1: [1, 3],
  2: [2, 3],
  3: [0, 2],
};

/** Index of the SRS kick test that upgrades a mini to a full T-spin (the (+-1, -+2) test). */
const UPGRADE_KICK_INDEX = 4;

export interface SpinContext {
  readonly lastMoveWasRotation: boolean;
  readonly kickIndex: number;
  readonly rotationDirection: RotationDirection | null;
}

/** 3-corner T-spin rule with mini/full distinction. Walls and floor count as filled corners. */
export function detectTSpin(board: Board, piece: ActivePiece, context: SpinContext): SpinKind {
  if (piece.type !== 'T' || !context.lastMoveWasRotation) return 'none';
  const filled = CORNERS.map(([cx, cy]) => board.isBlocked(piece.x + cx, piece.y + cy));
  const count = filled.filter(Boolean).length;
  if (count < 3) return 'none';
  const [a, b] = FRONT_CORNERS[piece.rotation];
  if (filled[a] && filled[b]) return 'tspin';
  if (context.kickIndex === UPGRADE_KICK_INDEX && context.rotationDirection !== '180') return 'tspin';
  return 'tspin-mini';
}
