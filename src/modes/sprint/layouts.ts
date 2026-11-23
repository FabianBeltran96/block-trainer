/** A 40-line stacking distribution: N columns left of the well, the well, M columns right. */
export interface SprintLayout {
  readonly id: string;
  readonly name: string;
  /** 0-based column kept open for I pieces. */
  readonly wellColumn: number;
  readonly description: string;
}

// Names follow community usage: "6-3" = 6 columns, well, 3 columns; "9-1" = 9 stacked columns + 1 well.
export const SPRINT_LAYOUTS: readonly SprintLayout[] = [
  { id: '9-1', name: '9-1 (right well)', wellColumn: 9, description: 'Well on the right edge. Simplest reads, tetris-only stacking.' },
  { id: '1-9', name: '9-1 (left well)', wellColumn: 0, description: 'Well on the left edge. Mirror of 9-1.' },
  { id: '6-3', name: '6-3', wellColumn: 6, description: 'Most common 40L setup: 6 columns, well, 3 columns. Flexible for S/Z.' },
  { id: '3-6', name: '3-6', wellColumn: 3, description: 'Mirror of 6-3.' },
  { id: '7-2', name: '7-2', wellColumn: 7, description: '7 columns, well, 2 columns. The 2-wide side takes O and vertical pieces.' },
  { id: '2-7', name: '2-7', wellColumn: 2, description: 'Mirror of 7-2.' },
];

export const DEFAULT_LAYOUT_ID = '6-3';
export const SPRINT_LINES = 40;

export function findLayout(id: string): SprintLayout {
  return SPRINT_LAYOUTS.find((l) => l.id === id) ?? SPRINT_LAYOUTS.find((l) => l.id === DEFAULT_LAYOUT_ID)!;
}
