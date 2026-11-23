import type { Action } from './actions';

export type KeyPhase = 'down' | 'up';

export interface KeyboardHandlers {
  onAction(action: Action, phase: KeyPhase, timeStamp: number): void;
  onBlur(): void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** DOM adapter: maps keyboard events to actions via the current keymap, ignoring OS key repeat. Returns a disposer. */
export function bindKeyboard(
  target: Window,
  handlers: KeyboardHandlers,
  getKeymap: () => Readonly<Record<string, Action>>,
): () => void {
  const handle = (phase: KeyPhase) => (event: KeyboardEvent) => {
    const action = getKeymap()[event.code];
    if (!action || isTypingTarget(event.target)) return;
    event.preventDefault();
    if (phase === 'down' && event.repeat) return;
    handlers.onAction(action, phase, event.timeStamp);
  };
  const onKeyDown = handle('down');
  const onKeyUp = handle('up');
  const onBlur = () => handlers.onBlur();
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
  };
}
