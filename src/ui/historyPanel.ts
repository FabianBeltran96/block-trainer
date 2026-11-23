import type { SessionSummary } from '../storage/historyStore';
import { el, formatDate, formatDuration } from './dom';

export function createHistoryPanel(container: HTMLElement): { render(history: readonly SessionSummary[]): void } {
  const body = el('tbody');
  const table = el('table', { class: 'history' }, [
    el('thead', {}, [
      el('tr', {}, ['Date', 'Pieces', 'Time', 'PPS', 'KPP', 'Finesse'].map((h) => el('th', {}, [h]))),
    ]),
    body,
  ]);
  const empty = el('p', { class: 'note' }, ['No sessions yet. Sessions are saved on restart, top-out or settings change.']);
  container.replaceChildren(el('h2', {}, ['Recent sessions']), empty, table);
  return {
    render(history) {
      empty.hidden = history.length > 0;
      table.hidden = history.length === 0;
      body.replaceChildren(
        ...history.map((s) =>
          el('tr', {}, [
            el('td', {}, [formatDate(s.date)]),
            el('td', {}, [String(s.pieces)]),
            el('td', {}, [formatDuration(s.durationMs)]),
            el('td', {}, [s.pps.toFixed(2)]),
            el('td', {}, [s.kpp.toFixed(2)]),
            el('td', {}, [`${s.finessePct.toFixed(1)}% (${s.faults})`]),
          ]),
        ),
      );
    },
  };
}
