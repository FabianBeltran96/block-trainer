export type GameAction =
  | 'moveLeft'
  | 'moveRight'
  | 'softDrop'
  | 'hardDrop'
  | 'rotateCW'
  | 'rotateCCW'
  | 'rotate180'
  | 'hold';

export type Action = GameAction | 'restart';

export const GAME_ACTIONS: readonly GameAction[] = [
  'moveLeft',
  'moveRight',
  'softDrop',
  'hardDrop',
  'rotateCW',
  'rotateCCW',
  'rotate180',
  'hold',
];

export function isGameAction(value: unknown): value is GameAction {
  return typeof value === 'string' && (GAME_ACTIONS as readonly string[]).includes(value);
}
