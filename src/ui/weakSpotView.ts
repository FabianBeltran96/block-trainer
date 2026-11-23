import { formatSequence } from '../modes/finesse/verdict';
import { describePattern, parsePatternKey, patternSolution } from '../modes/weakspots/patterns';
import { DRILL_LENGTHS, DRILL_PATTERNS, rankWeakSpots, totals } from '../modes/weakspots/weakSpots';
import type { WeakSpotData } from '../storage/weakSpotStore';
import { el, formatDate } from './dom';

export const WEAK_SPOTS_SHOWN = 10;

export interface WeakSpotViewHandlers {
  onStartDrill(reps: number): void;
  onResetWeakSpots(): void;
}

function button(label: string, onClick: () => void, attrs: Record<string, string | boolean> = {}) {
  const b = el('button', { type: 'button', ...attrs }, [label]);
  b.addEventListener('click', () => {
    b.blur();
    onClick();
  });
  return b;
}

export function weakSpotView(
  data: WeakSpotData,
  active: boolean,
  allow180: boolean,
  handlers: WeakSpotViewHandlers,
): Node[] {
  const spots = rankWeakSpots(data.stats);
  const all = totals(data.stats);
  const optimal = (pattern: Parameters<typeof patternSolution>[0]) => {
    const solution = patternSolution(pattern, allow180);
    return solution ? formatSequence(solution.sequence) : '';
  };
  const nodes: Node[] = [
    el('p', { class: 'note' }, [
      'Every placement in any mode is filed by piece, orientation and column. ',
      `The drill repeats your ${DRILL_PATTERNS} weakest patterns on an empty board with a target ghost; `,
      `only the last 20 tries of each pattern count, so fixed habits drop off the list.`,
    ]),
  ];

  if (!active) {
    const length = el(
      'select',
      { name: 'drillReps', title: 'Pieces in the drill' },
      DRILL_LENGTHS.map((n) => el('option', { value: n }, [`${n} pieces`])),
    );
    nodes.push(
      el('div', { class: 'row' }, [
        length,
        button(`Drill top ${Math.min(DRILL_PATTERNS, spots.length) || DRILL_PATTERNS}`, () => handlers.onStartDrill(Number(length.value)), {
          class: 'primary',
          disabled: spots.length === 0,
          title: spots.length === 0 ? 'Play some pieces first: no faults recorded yet' : 'Start the weak-spot drill',
        }),
      ]),
    );
  }

  nodes.push(
    el('div', { class: 'note' }, [
      `${all.attempts} placements tracked over ${all.patterns} patterns, ${all.faults} faults in total.`,
    ]),
  );

  if (spots.length === 0) {
    nodes.push(el('p', {}, ['No recent faults. Play the finesse drill, a trial or a sprint to build your profile.']));
  } else {
    nodes.push(
      el('table', { class: 'history weak' }, [
        el('thead', {}, [el('tr', {}, ['#', 'Pattern', 'Faults', 'Optimal'].map((h) => el('th', {}, [h])))]),
        el(
          'tbody',
          {},
          spots.slice(0, WEAK_SPOTS_SHOWN).map((spot, i) =>
            el('tr', { class: i < DRILL_PATTERNS ? 'drilled' : '' }, [
              el('td', {}, [String(i + 1)]),
              el('td', {}, [describePattern(spot.pattern)]),
              el('td', { title: `${spot.stats.faults}/${spot.stats.attempts} all time` }, [
                `${spot.recentFaults}/${spot.recentAttempts}`,
              ]),
              el('td', { class: 'note' }, [optimal(spot.pattern)]),
            ]),
          ),
        ),
      ]),
    );
  }

  const last = data.lastDrill;
  if (last) {
    const parts = last.patterns.map((p) => {
      const pattern = parsePatternKey(p.key);
      return `${pattern ? describePattern(pattern) : p.key} ${p.clean}/${p.attempts}`;
    });
    nodes.push(
      el('div', { class: `attempt ${last.clean === last.reps ? 'ok' : 'fault'}` }, [
        `Last drill (${formatDate(last.date)}): ${last.clean}/${last.reps} clean. `,
        el('span', { class: 'note' }, [parts.join(' · ')]),
      ]),
    );
  }

  if (all.attempts > 0 && !active) {
    nodes.push(el('div', { class: 'row' }, [button('Reset weak-spot stats', handlers.onResetWeakSpots)]));
  }
  return nodes;
}
