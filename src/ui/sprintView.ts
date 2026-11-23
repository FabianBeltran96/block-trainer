import type { ReplayData } from '../replay/replay';
import { findLayout, SPRINT_LAYOUTS, SPRINT_LINES } from '../modes/sprint/layouts';
import { tetrisRate, type SprintTally } from '../modes/sprint/analysis';
import { SPRINT_GUIDES, type SprintGuide } from '../modes/sprint/guide';
import type { SprintData, SprintRecord } from '../storage/sprintStore';
import { el, formatDate } from './dom';

export interface SprintViewHandlers {
  onStartSprint(layoutId: string): void;
  onSelectLayout(layoutId: string): void;
  onSelectGuide(guide: SprintGuide): void;
  onPlayReplay(replay: ReplayData): void;
}

export function formatTime(ms: number): string {
  const total = ms / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = (total - minutes * 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${seconds}`;
}

function button(label: string, onClick: () => void, attrs: Record<string, string> = {}) {
  const b = el('button', { type: 'button', ...attrs }, [label]);
  b.addEventListener('click', () => {
    b.blur();
    onClick();
  });
  return b;
}

function recordLine(r: SprintRecord): string {
  const time = r.completed ? formatTime(r.durationMs) : `DNF (${r.lines}/${SPRINT_LINES})`;
  return (
    `${time} · ${r.pps.toFixed(2)} pps · finesse ${r.finessePct.toFixed(0)}% · ` +
    `tetris ${r.tetrisPct.toFixed(0)}% · well ${r.wellViolations} · holes ${r.holes}`
  );
}

export function sprintView(
  data: SprintData,
  tally: SprintTally | null,
  active: boolean,
  handlers: SprintViewHandlers,
): Node[] {
  const layout = findLayout(data.layoutId);
  const select = el(
    'select',
    { name: 'layout', title: 'Stack distribution' },
    SPRINT_LAYOUTS.map((l) => el('option', { value: l.id, selected: l.id === layout.id }, [l.name])),
  );
  select.addEventListener('change', () => {
    select.blur();
    handlers.onSelectLayout(select.value);
  });

  const guide = SPRINT_GUIDES.find((g) => g.id === data.guide) ?? SPRINT_GUIDES[0]!;
  const guideSelect = el(
    'select',
    { name: 'guide', title: 'Placement ghost' },
    SPRINT_GUIDES.map((g) => el('option', { value: g.id, selected: g.id === guide.id }, [`Guide: ${g.name}`])),
  );
  guideSelect.addEventListener('change', () => {
    guideSelect.blur();
    handlers.onSelectGuide(guideSelect.value as SprintGuide);
  });

  const nodes: Node[] = [
    el('p', { class: 'note' }, [
      `Clear ${SPRINT_LINES} lines keeping the highlighted well open for I pieces. `,
      'Each piece flags well violations (non-I in the well) and new holes. R restarts with new pieces.',
    ]),
    el('p', {}, [el('strong', {}, [layout.name]), ` — ${layout.description}`]),
    el('div', { class: 'row' }, [guideSelect]),
    el('p', { class: 'note' }, [
      `${guide.description} Ghost labels: order, H = hold first, * = soft drop then tuck or spin.`,
    ]),
  ];

  if (tally && active) {
    nodes.push(
      el('div', { class: 'tally' }, [
        `Lines ${tally.lines}/${SPRINT_LINES} · tetrises ${tally.clears[4]} (${tetrisRate(tally).toFixed(0)}%) · `,
        el('span', { class: tally.wellViolations ? 'bad' : '' }, [`well ${tally.wellViolations}`]),
        ' · ',
        el('span', { class: tally.holes ? 'bad' : '' }, [`holes ${tally.holes}`]),
      ]),
    );
  } else {
    nodes.push(el('div', { class: 'row' }, [select, button(`Start ${layout.name} 40L`, () => handlers.onStartSprint(layout.id), { class: 'primary' })]));
  }

  if (data.last) {
    const { record, replay } = data.last;
    nodes.push(
      el('div', { class: `attempt ${record.completed ? 'ok' : 'fault'}` }, [
        `Last (${record.layoutId}): ${recordLine(record)}`,
        button('Replay', () => handlers.onPlayReplay(replay)),
      ]),
    );
  }

  const bests = SPRINT_LAYOUTS.filter((l) => data.best[l.id]);
  if (bests.length > 0) {
    nodes.push(
      el('table', { class: 'history' }, [
        el('thead', {}, [el('tr', {}, ['Best', 'Time', 'PPS', 'Tetris', 'Well', 'Holes', ''].map((h) => el('th', {}, [h])))]),
        el(
          'tbody',
          {},
          bests.map((l) => {
            const { record, replay } = data.best[l.id]!;
            return el('tr', { class: l.id === layout.id ? 'best' : '' }, [
              el('td', {}, [l.name]),
              el('td', {}, [formatTime(record.durationMs)]),
              el('td', {}, [record.pps.toFixed(2)]),
              el('td', {}, [`${record.tetrisPct.toFixed(0)}%`]),
              el('td', {}, [String(record.wellViolations)]),
              el('td', {}, [String(record.holes)]),
              el('td', {}, [button('Replay', () => handlers.onPlayReplay(replay))]),
            ]);
          }),
        ),
      ]),
    );
  }

  const recent = data.recent.filter((r) => r.layoutId === layout.id).slice(0, 5);
  if (recent.length > 0) {
    nodes.push(
      el('div', { class: 'recent' }, [
        el('div', { class: 'note' }, [`Recent ${layout.name}:`]),
        ...recent.map((r) => el('div', { class: 'note' }, [`${formatDate(r.date)} — ${recordLine(r)}`])),
      ]),
    );
  }
  return nodes;
}
