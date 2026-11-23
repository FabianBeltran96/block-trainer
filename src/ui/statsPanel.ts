import type { SessionStats } from '../modes/finesse/session';
import { el, formatDuration } from './dom';

const ROWS: ReadonlyArray<[label: string, format: (s: SessionStats) => string]> = [
  ['Pieces', (s) => String(s.pieces)],
  ['Time', (s) => formatDuration(s.durationMs)],
  ['PPS', (s) => s.pps.toFixed(2)],
  ['KPP', (s) => s.kpp.toFixed(2)],
  ['Finesse faults', (s) => String(s.faults)],
  ['Finesse', (s) => `${s.finessePct.toFixed(1)}%`],
];

export function createStatsPanel(container: HTMLElement): { update(stats: SessionStats): void } {
  const values = ROWS.map(() => el('dd'));
  const list = el('dl', { class: 'stats' });
  ROWS.forEach(([label], i) => list.append(el('dt', {}, [label]), values[i]!));
  container.replaceChildren(el('h2', {}, ['Stats']), list);
  let last = '';
  return {
    update(stats) {
      const texts = ROWS.map(([, format]) => format(stats));
      const key = texts.join('|');
      if (key === last) return;
      last = key;
      texts.forEach((text, i) => (values[i]!.textContent = text));
    },
  };
}
