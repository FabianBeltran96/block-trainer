/**
 * Rotation kick data (SRS+ semantics).
 *
 * All tables below are written in the convention used by public SRS references:
 * offsets are (x, y) with +x = right and +y = UP, and each list starts with the
 * implicit (0, 0) "no kick" test. `getKicks` converts them to the engine's y-down board.
 *
 * Sources:
 * - J/L/S/T/Z 90-degree kicks: standard SRS table (tetris.wiki "Super Rotation System",
 *   identical on the Hard Drop wiki "SRS" page).
 * - I 90-degree kicks: SRS+ variant. Same kick set as standard SRS I, but with the
 *   left/right tests reordered so the table is symmetric (described on tetris.wiki).
 *   Exact ordering taken from the open-source @haelp/teto engine kick data ("SRS+" preset),
 *   converted from its y-down convention.
 * - 180-degree kicks (all pieces): from the same @haelp/teto "SRS+" preset.
 *   Not cross-checked against an official first-party table. Isolated here on purpose.
 */
import type { PieceType, Rotation } from './types';

type Offset = readonly [dx: number, dyUp: number];
type KickKey = `${Rotation}${Rotation}`;
type KickTable = Partial<Record<KickKey, readonly Offset[]>>;

const JLSTZ_KICKS: KickTable = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  // 180-degree rotations
  '02': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '13': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '20': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '31': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};

const I_KICKS: KickTable = {
  '01': [[0, 0], [1, 0], [-2, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [2, -1], [-1, 2]],
  // 180-degree rotations
  '02': [[0, 0], [0, 1]],
  '13': [[0, 0], [1, 0]],
  '20': [[0, 0], [0, -1]],
  '31': [[0, 0], [-1, 0]],
};

const NO_KICKS: readonly Offset[] = [[0, 0]];

/** Kick offsets to try in order, already converted to board space (dx, dy with +y = down). */
export function getKicks(type: PieceType, from: Rotation, to: Rotation): ReadonlyArray<readonly [number, number]> {
  if (type === 'O') return NO_KICKS;
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  const offsets = table[`${from}${to}`] ?? NO_KICKS;
  return offsets.map(([dx, dyUp]) => [dx, -dyUp] as const);
}
