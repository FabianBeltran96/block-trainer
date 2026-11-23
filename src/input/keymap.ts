import type { Action } from './actions';

/** Each action can be bound to up to this many keys (`KeyboardEvent.code`). */
export const SLOTS_PER_ACTION = 2;

export type Keymap = Readonly<Record<Action, readonly string[]>>;

export const BINDABLE_ACTIONS: readonly Action[] = [
  'moveLeft',
  'moveRight',
  'softDrop',
  'hardDrop',
  'rotateCCW',
  'rotateCW',
  'rotate180',
  'hold',
  'restart',
];

export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  moveLeft: 'Move left',
  moveRight: 'Move right',
  softDrop: 'Soft drop',
  hardDrop: 'Hard drop',
  rotateCCW: 'Rotate CCW',
  rotateCW: 'Rotate CW',
  rotate180: 'Rotate 180',
  hold: 'Hold',
  restart: 'Restart',
};

export const DEFAULT_KEYMAP: Keymap = {
  moveLeft: ['ArrowLeft'],
  moveRight: ['ArrowRight'],
  softDrop: ['ArrowDown'],
  hardDrop: ['Space'],
  rotateCCW: ['KeyZ'],
  rotateCW: ['KeyX', 'ArrowUp'],
  rotate180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft'],
  restart: ['KeyR'],
};

/** Accepts unknown persisted data; falls back to defaults per action. A key code is never bound twice. */
export function sanitizeKeymap(input: unknown): Keymap {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const used = new Set<string>();
  const result = {} as Record<Action, string[]>;
  for (const action of BINDABLE_ACTIONS) {
    const value = raw[action];
    const codes = Array.isArray(value) ? value : DEFAULT_KEYMAP[action];
    result[action] = codes
      .filter((code): code is string => typeof code === 'string' && code.length > 0 && code.length < 40)
      .filter((code) => (used.has(code) ? false : (used.add(code), true)))
      .slice(0, SLOTS_PER_ACTION);
  }
  return result;
}

/** Binds `code` to `action` at `slot`, removing it from any other binding. `null` clears the slot. */
export function assignKey(keymap: Keymap, action: Action, slot: number, code: string | null): Keymap {
  const next = {} as Record<Action, string[]>;
  for (const a of BINDABLE_ACTIONS) next[a] = keymap[a].filter((c) => c !== code);
  const slots = [...keymap[action]];
  if (code === null) slots.splice(slot, 1);
  else slots[slot] = code;
  next[action] = slots.filter((c, i) => c !== undefined && slots.indexOf(c) === i).slice(0, SLOTS_PER_ACTION);
  return next;
}

/** Lookup table used by the keyboard adapter. */
export function toCodeMap(keymap: Keymap): Record<string, Action> {
  const map: Record<string, Action> = {};
  for (const action of BINDABLE_ACTIONS) for (const code of keymap[action]) map[code] = action;
  return map;
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt',
  AltRight: 'R-Alt',
};

/** Human-readable name for a `KeyboardEvent.code`. */
export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
