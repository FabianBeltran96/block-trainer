import type { Action } from '../input/actions';
import {
  ACTION_LABELS,
  assignKey,
  BINDABLE_ACTIONS,
  DEFAULT_KEYMAP,
  keyName,
  SLOTS_PER_ACTION,
  type Keymap,
} from '../input/keymap';
import { el } from './dom';

export interface KeymapPanelHandlers {
  onChange(keymap: Keymap): void;
}

interface Capture {
  readonly action: Action;
  readonly slot: number;
}

/**
 * Click a slot, then press a key to bind it. Escape cancels, Backspace/Delete clears the slot.
 * While capturing, the key never reaches the game (capture-phase listener + stopImmediatePropagation).
 */
export function createKeymapPanel(container: HTMLElement, initial: Keymap, handlers: KeymapPanelHandlers) {
  let keymap = initial;
  let capture: Capture | null = null;
  let swallowKeyUp: string | null = null;
  const status = el('p', { class: 'note' }, ['Click a slot, then press a key. Esc cancels, Backspace clears.']);
  const list = el('div', { class: 'keymap' });

  const commit = (next: Keymap) => {
    keymap = next;
    handlers.onChange(keymap);
  };

  const render = () => {
    list.replaceChildren(
      ...BINDABLE_ACTIONS.map((action) => {
        const slots = Array.from({ length: SLOTS_PER_ACTION }, (_, slot) => {
          const code = keymap[action][slot];
          const active = capture?.action === action && capture.slot === slot;
          const button = el(
            'button',
            { type: 'button', class: `key-slot${active ? ' capturing' : ''}${code ? '' : ' empty'}` },
            [active ? 'Press a key...' : code ? keyName(code) : '—'],
          );
          button.addEventListener('click', () => {
            capture = active ? null : { action, slot: Math.min(slot, keymap[action].length) };
            button.blur();
            render();
          });
          return button;
        });
        return el('div', { class: 'keymap-row' }, [el('span', {}, [ACTION_LABELS[action]]), ...slots]);
      }),
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!capture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    const { action, slot } = capture;
    capture = null;
    swallowKeyUp = event.code;
    if (event.code === 'Escape') {
      status.textContent = 'Cancelled.';
    } else if (event.code === 'Backspace' || event.code === 'Delete') {
      commit(assignKey(keymap, action, slot, null));
      status.textContent = `${ACTION_LABELS[action]}: slot cleared.`;
    } else {
      const previous = BINDABLE_ACTIONS.find((a) => a !== action && keymap[a].includes(event.code));
      commit(assignKey(keymap, action, slot, event.code));
      status.textContent = previous
        ? `${keyName(event.code)} moved from ${ACTION_LABELS[previous]} to ${ACTION_LABELS[action]}.`
        : `${ACTION_LABELS[action]} = ${keyName(event.code)}.`;
    }
    render();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (swallowKeyUp !== event.code) return;
    swallowKeyUp = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  const reset = el('button', { type: 'button' }, ['Reset to defaults']);
  reset.addEventListener('click', () => {
    reset.blur();
    capture = null;
    commit(DEFAULT_KEYMAP);
    status.textContent = 'Default keys restored.';
    render();
  });

  container.replaceChildren(el('h2', {}, ['Controls']), list, reset, status);
  render();
}
