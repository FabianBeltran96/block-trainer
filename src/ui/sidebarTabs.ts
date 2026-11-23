import type { KeyValueStorage } from '../storage/keyValue';
import { STORAGE_PREFIX } from '../storage/keyValue';
import { el } from './dom';

const TAB_KEY = `${STORAGE_PREFIX}:sidebar-tab`;

/** Shows one `[data-pane]` section at a time so the sidebar always fits in the viewport. */
export function createSidebarTabs(nav: HTMLElement, panes: HTMLElement[], storage: KeyValueStorage) {
  const names = panes.map((pane) => pane.dataset.pane ?? pane.id);
  const buttons = names.map((name) => {
    const button = el('button', { type: 'button', role: 'tab', class: 'tab' }, [name]);
    button.addEventListener('click', () => {
      button.blur();
      select(name);
    });
    return button;
  });
  nav.replaceChildren(...buttons);

  function select(name: string): void {
    const index = Math.max(0, names.indexOf(name));
    panes.forEach((pane, i) => (pane.hidden = i !== index));
    buttons.forEach((button, i) => {
      button.classList.toggle('active', i === index);
      button.setAttribute('aria-selected', String(i === index));
    });
    storage.setItem(TAB_KEY, names[index]!);
  }

  select(storage.getItem(TAB_KEY) ?? names[0]!);
  return { select };
}
