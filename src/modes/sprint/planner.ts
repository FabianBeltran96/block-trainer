import {
  Board,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  dropPiece,
  fits,
  pieceCells,
  pieceId,
  shiftToWall,
  spawnPiece,
  tryRotate,
  tryShift,
  type ActivePiece,
  type Cell,
  type PieceType,
  type Rotation,
  type RotationDirection,
} from '../../engine';
import { countHoles } from './analysis';

/** Pieces covered by the opener ghost: the active piece plus the 5 visible in the queue. */
export const OPENER_PIECES = 6;
/** Lookahead when guiding the whole run: everything visible (active + 5 previews). */
export const LOOKAHEAD_PIECES = 6;
const BEAM_WIDTH = 40;
const HOLE_PENALTY = 25;
const WELL_FILL_PENALTY = 15;
const HOLD_PENALTY = 0.5;
/** Prefer a plain hard drop when a tuck or spin is not clearly better. */
const MANEUVER_PENALTY = 1.5;
const TETRIS_BONUS = 40;
/** Clearing 1-3 lines with an I in the well wastes it. */
const BURN_PENALTY = 10;
/** Stack height (rows) above which the plan gets nervous. */
const DANGER_HEIGHT = 12;

/** How the piece gets there: a plain hard drop, or soft drop then a slide (tuck) or rotation (spin). */
export type Maneuver = 'drop' | 'tuck' | 'spin';

export interface PlannedPlacement {
  readonly type: PieceType;
  readonly cells: readonly Cell[];
  /** The player must press hold before placing this piece. */
  readonly viaHold: boolean;
  readonly maneuver: Maneuver;
  readonly linesCleared: number;
}

export interface PlanInput {
  readonly board: Board;
  readonly active: PieceType;
  readonly queue: readonly PieceType[];
  readonly hold: PieceType | null;
  /** Hold already used for the active piece. */
  readonly holdUsed: boolean;
  readonly count: number;
  readonly wellColumn: number;
}

interface Candidate {
  readonly cells: Cell[];
  readonly maneuver: Maneuver;
}

interface Node {
  readonly board: Board;
  readonly plan: readonly PlannedPlacement[];
  /** Accumulated hold / maneuver / line-clear terms. */
  readonly penalty: number;
  readonly score: number;
  readonly pos: number;
  readonly hold: PieceType | null;
  readonly hash: number;
}

const cellsKey = (cells: readonly Cell[]) =>
  cells
    .map(([x, y]) => y * BOARD_WIDTH + x)
    .sort((a, b) => a - b)
    .join(',');

const stateKey = (p: ActivePiece) => `${p.x},${p.y},${p.rotation}`;

const LOW_MOVES: readonly { readonly dx?: -1 | 1; readonly rotate?: RotationDirection }[] = [
  { dx: -1 },
  { dx: 1 },
  { rotate: 'cw' },
  { rotate: 'ccw' },
  { rotate: '180' },
];

/**
 * Every distinct resting placement for one piece: hard drops from spawn height, plus (when the
 * board has overhangs) up to two slides or rotations after a soft drop, which covers tucks
 * and spins. Without overhangs every resting spot is reachable by a hard drop, so that
 * expensive part is skipped.
 */
export function placements(board: Board, type: PieceType): Candidate[] {
  const result = new Map<string, Candidate>();
  const landed: ActivePiece[] = [];
  const spawn = spawnPiece(type);
  for (const rotation of [0, 1, 2, 3] as Rotation[]) {
    const start = { ...spawn, rotation };
    if (!fits(board, start)) continue;
    for (let p: ActivePiece | null = shiftToWall(board, start, -1); p; p = tryShift(board, p, 1)) {
      const rest = dropPiece(board, p);
      const cells = pieceCells(rest);
      const key = cellsKey(cells);
      if (result.has(key)) continue;
      result.set(key, { cells, maneuver: 'drop' });
      landed.push(rest);
    }
  }
  if (countHoles(board.cells) === 0) return [...result.values()];

  const seen = new Set(landed.map(stateKey));
  let frontier = landed;
  for (let depth = 0; depth < 2; depth++) {
    const next: ActivePiece[] = [];
    for (const piece of frontier) {
      for (const move of LOW_MOVES) {
        const moved = move.dx ? tryShift(board, piece, move.dx) : tryRotate(board, piece, move.rotate!)?.piece;
        if (!moved) continue;
        const rest = dropPiece(board, moved);
        const state = stateKey(rest);
        if (seen.has(state)) continue;
        seen.add(state);
        next.push(rest);
        const cells = pieceCells(rest);
        const key = cellsKey(cells);
        if (!result.has(key)) result.set(key, { cells, maneuver: move.rotate ? 'spin' : 'tuck' });
      }
    }
    frontier = next;
  }
  return [...result.values()];
}

function place(board: Board, type: PieceType, cells: readonly Cell[]): { board: Board; lines: number } {
  const next = board.clone();
  const id = pieceId(type);
  for (const [x, y] of cells) next.set(x, y, id);
  const rows = next.fullRows();
  next.clearRows(rows);
  return { board: next, lines: rows.length };
}

/** Lower is better: no holes, open well, flat and low stack with no narrow pits. */
export function evaluate(board: Board, wellColumn: number): number {
  const cells = board.cells;
  const heights = new Array<number>(BOARD_WIDTH);
  let holes = 0;
  // One pass per column: first filled cell gives the height, empty cells below it are holes.
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let h = 0;
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (cells[y * BOARD_WIDTH + x] === 0) {
        if (h > 0) holes++;
      } else if (h === 0) {
        h = BOARD_HEIGHT - y;
      }
    }
    heights[x] = h;
  }
  let bumpiness = 0;
  let pits = 0;
  let maxHeight = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    if (x === wellColumn) continue;
    const h = heights[x]!;
    if (h > maxHeight) maxHeight = h;
    if (x > 0 && x - 1 !== wellColumn) bumpiness += Math.abs(h - heights[x - 1]!);
    const left = x === 0 || x - 1 === wellColumn ? Infinity : heights[x - 1]!;
    const right = x === BOARD_WIDTH - 1 || x + 1 === wellColumn ? Infinity : heights[x + 1]!;
    if (Math.min(left, right) - h >= 3) pits++;
  }
  return (
    holes * HOLE_PENALTY +
    heights[wellColumn]! * WELL_FILL_PENALTY +
    bumpiness * 2 +
    pits * 6 +
    maxHeight +
    Math.max(0, maxHeight - DANGER_HEIGHT) * 10
  );
}

/** Only a vertical I may enter the well. */
function respectsWell(type: PieceType, cells: readonly Cell[], wellColumn: number): boolean {
  if (!cells.some(([x]) => x === wellColumn)) return true;
  return type === 'I' && cells.every(([x]) => x === wellColumn);
}

function lineTerm(type: PieceType, cells: readonly Cell[], lines: number, wellColumn: number): number {
  if (lines === 4) return -TETRIS_BONUS;
  const inWell = type === 'I' && cells.some(([x]) => x === wellColumn);
  return inWell && lines > 0 ? BURN_PENALTY : 0;
}

function boardHash(board: Board): number {
  let hash = 0x811c9dc5;
  const cells = board.cells;
  for (let i = 0; i < cells.length; i++) hash = Math.imul(hash ^ (cells[i]! === 0 ? 0 : 1), 0x01000193);
  return hash >>> 0;
}

/**
 * Beam search for a clean stack, allowing hold, tucks and spins: the well stays open except for
 * a vertical I, holes are heavily penalized, tetrises rewarded, then the flattest and lowest
 * stack wins. Returns placements in the order they should be made; fewer than `count` when the
 * visible queue runs out. Each placement's cells are relative to the board at that moment
 * (rows shift after a line clear).
 */
export function planStack(input: PlanInput): PlannedPlacement[] {
  const sequence = [input.active, ...input.queue];
  const cache = new Map<string, Candidate[]>();
  const candidatesFor = (board: Board, hash: number, type: PieceType) => {
    const key = `${hash}|${type}`;
    let list = cache.get(key);
    if (!list) {
      list = placements(board, type).filter((c) => respectsWell(type, c.cells, input.wellColumn));
      cache.set(key, list);
    }
    return list;
  };

  let beam: Node[] = [
    { board: input.board, plan: [], penalty: 0, score: 0, pos: 0, hold: input.hold, hash: boardHash(input.board) },
  ];
  for (let step = 0; step < input.count; step++) {
    const next: Node[] = [];
    for (const node of beam) {
      const current = sequence[node.pos];
      if (!current) continue;
      const canHold = !(step === 0 && input.holdUsed);
      const options: { type: PieceType; pos: number; hold: PieceType | null; viaHold: boolean }[] = [
        { type: current, pos: node.pos + 1, hold: node.hold, viaHold: false },
      ];
      if (canHold && node.hold !== null && node.hold !== current) {
        options.push({ type: node.hold, pos: node.pos + 1, hold: current, viaHold: true });
      }
      const following = sequence[node.pos + 1];
      if (canHold && node.hold === null && following && following !== current) {
        options.push({ type: following, pos: node.pos + 2, hold: current, viaHold: true });
      }
      const hash = node.hash;
      for (const option of options) {
        for (const candidate of candidatesFor(node.board, hash, option.type)) {
          const { board, lines } = place(node.board, option.type, candidate.cells);
          const penalty =
            node.penalty +
            (option.viaHold ? HOLD_PENALTY : 0) +
            (candidate.maneuver === 'drop' ? 0 : MANEUVER_PENALTY) +
            lineTerm(option.type, candidate.cells, lines, input.wellColumn);
          next.push({
            board,
            plan: [
              ...node.plan,
              { type: option.type, cells: candidate.cells, viaHold: option.viaHold, maneuver: candidate.maneuver, linesCleared: lines },
            ],
            penalty,
            score: penalty + evaluate(board, input.wellColumn),
            pos: option.pos,
            hold: option.hold,
            hash: boardHash(board),
          });
        }
      }
    }
    if (next.length === 0) break;
    next.sort((a, b) => a.score - b.score);
    // Different orders often reach the same board: keep only the best node per state.
    const seen = new Set<string>();
    beam = [];
    for (const node of next) {
      const key = `${node.hash}|${node.hold ?? '-'}|${node.pos}`;
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push(node);
      if (beam.length >= BEAM_WIDTH) break;
    }
  }
  return [...beam[0]!.plan];
}

/**
 * The part of a plan that can be drawn on the current board: placements after the first line
 * clear would be drawn on rows that have not shifted yet, so they are cut off.
 */
export function drawablePlan(plan: readonly PlannedPlacement[]): PlannedPlacement[] {
  const end = plan.findIndex((p) => p.linesCleared > 0);
  return end === -1 ? [...plan] : plan.slice(0, end + 1);
}

export function sameCells(a: readonly Cell[], b: readonly Cell[]): boolean {
  return cellsKey(a) === cellsKey(b);
}
