import type { Cell } from './types';

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 40;
export const VISIBLE_HEIGHT = 20;
export const GARBAGE_ID = 8;

/** Mutable 10x40 grid. Row 0 is the top; rows 20..39 are the visible field. */
export class Board {
  readonly cells: Uint8Array;

  constructor(cells?: Uint8Array) {
    this.cells = cells ? new Uint8Array(cells) : new Uint8Array(BOARD_WIDTH * BOARD_HEIGHT);
  }

  /**
   * Builds a board from rows aligned to the bottom of the field.
   * Any character other than '.' or ' ' is a filled garbage cell.
   */
  static fromRows(rows: readonly string[]): Board {
    const board = new Board();
    const top = BOARD_HEIGHT - rows.length;
    rows.forEach((row, i) => {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const ch = row[x] ?? '.';
        if (ch !== '.' && ch !== ' ') board.set(x, top + i, GARBAGE_ID);
      }
    });
    return board;
  }

  static inBounds(x: number, y: number): boolean {
    return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
  }

  get(x: number, y: number): number {
    return Board.inBounds(x, y) ? this.cells[y * BOARD_WIDTH + x]! : 0;
  }

  set(x: number, y: number, value: number): void {
    if (Board.inBounds(x, y)) this.cells[y * BOARD_WIDTH + x] = value;
  }

  /** Walls, floor, ceiling and filled cells are all blocked. */
  isBlocked(x: number, y: number): boolean {
    if (!Board.inBounds(x, y)) return true;
    return this.cells[y * BOARD_WIDTH + x] !== 0;
  }

  collides(cells: readonly Cell[]): boolean {
    return cells.some(([x, y]) => this.isBlocked(x, y));
  }

  clone(): Board {
    return new Board(this.cells);
  }

  fullRows(): number[] {
    const rows: number[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      let full = true;
      for (let x = 0; x < BOARD_WIDTH && full; x++) full = this.get(x, y) !== 0;
      if (full) rows.push(y);
    }
    return rows;
  }

  /** Removes the given rows and shifts everything above them down. */
  clearRows(rows: readonly number[]): void {
    if (rows.length === 0) return;
    const remove = new Set(rows);
    const next = new Uint8Array(this.cells.length);
    let target = BOARD_HEIGHT - 1;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (remove.has(y)) continue;
      next.set(this.cells.subarray(y * BOARD_WIDTH, (y + 1) * BOARD_WIDTH), target * BOARD_WIDTH);
      target--;
    }
    this.cells.set(next);
  }
}
