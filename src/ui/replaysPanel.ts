import type { ReplayData } from '../replay/replay';
import { el, formatDate, formatDuration } from './dom';

export interface ReplaysPanelHandlers {
  onPlay(replay: ReplayData, speed: number): void;
  onStop(): void;
  onExport(replay: ReplayData): void;
  onImport(file: File): void;
}

export const PLAYBACK_SPEEDS = [0.5, 1, 2] as const;

export function createReplaysPanel(container: HTMLElement, handlers: ReplaysPanelHandlers) {
  const list = el('ul', { class: 'replays' });
  const speed = el(
    'select',
    { name: 'speed', title: 'Playback speed' },
    PLAYBACK_SPEEDS.map((s) => el('option', { value: s, selected: s === 1 }, [`${s}x`])),
  );
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const importButton = el('button', { type: 'button' }, ['Import .json']);
  const stopButton = el('button', { type: 'button', hidden: true }, ['Stop replay']);
  const status = el('p', { class: 'note' });

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handlers.onImport(file);
    fileInput.value = '';
  });
  stopButton.addEventListener('click', () => handlers.onStop());

  container.replaceChildren(
    el('h2', {}, ['Replays']),
    el('div', { class: 'row' }, [el('label', {}, ['Speed ', speed]), importButton, stopButton, fileInput]),
    status,
    list,
  );

  const button = (label: string, onClick: () => void) => {
    const b = el('button', { type: 'button' }, [label]);
    b.addEventListener('click', () => {
      b.blur();
      onClick();
    });
    return b;
  };

  return {
    render(replays: readonly ReplayData[]): void {
      list.replaceChildren(
        ...replays.map((replay) =>
          el('li', {}, [
            el('span', { class: 'meta' }, [
              `${formatDate(replay.createdAt)} - ${replay.pieces} pcs - ${formatDuration(replay.durationMs)}`,
            ]),
            button('Play', () => handlers.onPlay(replay, Number(speed.value))),
            button('Export', () => handlers.onExport(replay)),
          ]),
        ),
      );
      if (replays.length === 0) list.replaceChildren(el('li', { class: 'note' }, ['No replays yet.']));
    },
    setPlaying(playing: boolean): void {
      stopButton.hidden = !playing;
    },
    setStatus(text: string): void {
      status.textContent = text;
    },
  };
}
