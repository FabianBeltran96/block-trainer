import { BOARD_HEIGHT, BOARD_WIDTH, type Cell, type PiecePlacedEvent } from '../../engine';

export interface PlacementIssues {
  /** A non-I piece (or a flat I) touched the well column. */
  readonly wellViolation: boolean;
  /** New covered empty cells created by this placement. */
  readonly holesCreated: number;
  /** Cells to highlight on the board when something went wrong. */
  readonly cells: readonly Cell[];
}

const isFilled = (cells: Uint8Array, x: number, y: number) => cells[y * BOARD_WIDTH + x] !== 0;

/** Empty cells with at least one filled cell above them in the same column. */
export function countHoles(cells: Uint8Array): number {
  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let covered = false;
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (isFilled(cells, x, y)) covered = true;
      else if (covered) holes++;
    }
  }
  return holes;
}

/** Board after locking `cells` and removing full rows. */
export function boardAfter(before: Uint8Array, cells: readonly Cell[]): Uint8Array {
  const placed = new Uint8Array(before);
  for (const [x, y] of cells) placed[y * BOARD_WIDTH + x] = 1;
  const kept: Uint8Array[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row = placed.subarray(y * BOARD_WIDTH, (y + 1) * BOARD_WIDTH);
    if (!row.every((c) => c !== 0)) kept.push(row);
  }
  const result = new Uint8Array(BOARD_WIDTH * BOARD_HEIGHT);
  const offset = BOARD_HEIGHT - kept.length;
  kept.forEach((row, i) => result.set(row, (offset + i) * BOARD_WIDTH));
  return result;
}

export function analyzePlacement(event: PiecePlacedEvent, wellColumn: number): PlacementIssues {
  const verticalI = event.piece === 'I' && (event.rotation === 1 || event.rotation === 3);
  const inWell = event.cells.filter(([x]) => x === wellColumn);
  const wellViolation = inWell.length > 0 && !verticalI;
  const holesCreated = Math.max(0, countHoles(boardAfter(event.boardBefore, event.cells)) - countHoles(event.boardBefore));
  return {
    wellViolation,
    holesCreated,
    cells: wellViolation || holesCreated > 0 ? event.cells : [],
  };
}

/** Running totals for one 40-line run. */
export interface SprintTally {
  readonly lines: number;
  /** Count of clears by size: index 1..4. */
  readonly clears: readonly [number, number, number, number, number];
  readonly wellViolations: number;
  readonly holes: number;
}

export const EMPTY_TALLY: SprintTally = { lines: 0, clears: [0, 0, 0, 0, 0], wellViolations: 0, holes: 0 };

export function addToTally(tally: SprintTally, event: PiecePlacedEvent, issues: PlacementIssues): SprintTally {
  const clears = [...tally.clears] as [number, number, number, number, number];
  if (event.linesCleared > 0) clears[Math.min(4, event.linesCleared)]!++;
  return {
    lines: tally.lines + event.linesCleared,
    clears,
    wellViolations: tally.wellViolations + (issues.wellViolation ? 1 : 0),
    holes: tally.holes + issues.holesCreated,
  };
}

/** Share of cleared lines that came from tetrises. */
export function tetrisRate(tally: SprintTally): number {
  return tally.lines > 0 ? ((tally.clears[4] * 4) / tally.lines) * 100 : 0;
}
