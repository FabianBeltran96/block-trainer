import type { HandlingConfig } from '../input/config';
import type { ReplayData } from '../replay/replay';
import {
  CALIBRATION_REPS,
  DEFAULT_CALIBRATION_REPS,
  isCalibrationDone,
  nextCalibrationTrial,
  rankResults,
  resolvedCount,
  winnerConfidence,
  type CalibrationRun,
  type ConfigSummary,
} from '../modes/training/calibration';
import { DEFAULT_TRIAL_PIECES, formatHandling, TRIAL_LENGTHS } from '../modes/training/trial';
import {
  highestPassed,
  isLadderComplete,
  PASS_FINESSE_PCT,
  requiredPps,
  UPGRADE_LADDER,
  type UpgradeProgress,
} from '../modes/training/upgrade';
import { el, formatDuration } from './dom';
import { sprintView } from './sprintView';
import type { SprintTally } from '../modes/sprint/analysis';
import type { SprintData } from '../storage/sprintStore';
import type { SprintGuide } from '../modes/sprint/guide';
import type { WeakSpotData } from '../storage/weakSpotStore';
import { weakSpotView } from './weakSpotView';

const TAB_LABELS: Record<TrainingTab, string> = {
  calibrate: 'Calibrate',
  upgrade: 'Upgrade',
  sprint: 'Sprint 40L',
  weak: 'Weak spots',
};
const TAB_ORDER: readonly TrainingTab[] = ['weak', 'sprint', 'calibrate', 'upgrade'];

export type TrainingTab = 'calibrate' | 'upgrade' | 'sprint' | 'weak';

export interface ActiveTrialView {
  readonly kind: TrainingTab;
  readonly label: string;
  readonly progress: string;
  /** Extra context shown next to the label (e.g. calibration round). */
  readonly detail?: string;
}

export interface TrainingState {
  readonly calibration: CalibrationRun | null;
  readonly upgrade: UpgradeProgress;
  readonly active: ActiveTrialView | null;
  readonly sprint: SprintData;
  readonly sprintTally: SprintTally | null;
  readonly weakSpots: WeakSpotData;
  readonly allow180: boolean;
}

export interface TrainingPanelHandlers {
  onStartCalibration(pieces: number, reps: number): void;
  onNextCalibrationTrial(): void;
  /** Skip/discard a calibration config, or restore it. */
  onToggleExcluded(label: string): void;
  onStartUpgrade(level: number, pieces: number): void;
  onResetUpgrade(): void;
  onApply(handling: HandlingConfig, label: string): void;
  onPlayReplay(replay: ReplayData): void;
  onStop(): void;
  onStartSprint(layoutId: string): void;
  onSelectLayout(layoutId: string): void;
  onSelectGuide(guide: SprintGuide): void;
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

export function createTrainingPanel(container: HTMLElement, handlers: TrainingPanelHandlers) {
  let tab: TrainingTab = 'weak';
  let state: TrainingState | null = null;
  const length = el(
    'select',
    { name: 'trialPieces', title: 'Pieces per trial' },
    TRIAL_LENGTHS.map((n) => el('option', { value: n, selected: n === DEFAULT_TRIAL_PIECES }, [`${n} pieces`])),
  );
  const repsSelect = el(
    'select',
    { name: 'calibrationReps', title: 'Attempts per config (averaged)' },
    CALIBRATION_REPS.map((n) => el('option', { value: n, selected: n === DEFAULT_CALIBRATION_REPS }, [`${n}x each`])),
  );
  const tabs = el('div', { class: 'tabs' });
  const body = el('div', { class: 'training-body' });
  container.replaceChildren(el('h2', {}, ['Training']), tabs, body);

  const pieces = () => Number(length.value);

  function renderTabs(): void {
    tabs.replaceChildren(
      ...TAB_ORDER.map((t) =>
        button(TAB_LABELS[t], () => {
          tab = t;
          render();
        }, { class: t === tab ? 'tab active' : 'tab' }),
      ),
    );
  }

  function activeBanner(active: ActiveTrialView) {
    return el('div', { class: 'banner' }, [
      el('strong', {}, [`${active.label}${active.detail ? ` (${active.detail})` : ''}: ${active.progress}`]),
      el('span', { class: 'note' }, ['Stats start on your first key. R retries this trial.']),
      el('div', { class: 'row' }, [
        ...(active.kind === 'calibrate'
          ? [button(`Skip ${active.label}`, () => handlers.onToggleExcluded(active.label))]
          : []),
        button('Stop training', handlers.onStop),
      ]),
    ]);
  }

  function resultRow(r: ConfigSummary, revealed: boolean, best: boolean, discarded: boolean) {
    const range = r.attempts.length > 1 ? `${r.scoreMin.toFixed(2)}–${r.scoreMax.toFixed(2)}` : '';
    return el('tr', { class: best ? 'best' : discarded ? 'discarded' : '' }, [
      el('td', { title: revealed ? formatHandling(r.handling) : 'Hidden until all trials are done' }, [
        `${best ? '★ ' : ''}${r.label}`,
        ...(revealed ? [el('div', { class: 'note' }, [formatHandling(r.handling)])] : []),
      ]),
      el('td', {}, [r.pps.toFixed(2)]),
      el('td', {}, [`${r.finessePct.toFixed(0)}%`]),
      el('td', {}, [r.kpp.toFixed(2)]),
      el('td', { title: 'Average score; range = worst–best attempt' }, [
        discarded ? '—' : r.score.toFixed(2),
        ...(range && !discarded ? [el('div', { class: 'note' }, [range])] : []),
      ]),
      el('td', { class: 'actions' }, [
        ...r.attempts.map((a, i) =>
          button(r.attempts.length > 1 ? `R${i + 1}` : 'Replay', () => handlers.onPlayReplay(a.replay), {
            title: `Replay attempt ${i + 1}: ${a.pps.toFixed(2)} pps, ${a.finessePct.toFixed(0)}% finesse`,
          }),
        ),
        button(discarded ? 'Restore' : 'Discard', () => handlers.onToggleExcluded(r.label), {
          title: discarded ? 'Count this config again' : 'Do not count this config in the ranking',
        }),
      ]),
    ]);
  }

  function calibrationView(s: TrainingState): Node[] {
    const run = s.calibration;
    const intro = el('p', { class: 'note' }, [
      'Plays the same piece sequence with several handling configs in random order, without telling you which is which. ',
      'Score = PPS x finesse rate (clean pieces per second), averaged over the attempts. ',
      'Each round uses a new piece sequence. Skip or discard a config to leave it out of the ranking.',
    ]);
    const nodes: Node[] = [intro];
    if (s.active?.kind === 'calibrate') nodes.push(activeBanner(s.active));

    const done = run !== null && isCalibrationDone(run);
    if (run === null || done) {
      nodes.push(
        el('div', { class: 'row' }, [
          length,
          repsSelect,
          button('Start calibration', () => handlers.onStartCalibration(pieces(), Number(repsSelect.value)), { class: 'primary' }),
        ]),
      );
    } else if (!s.active) {
      const next = nextCalibrationTrial(run)!;
      nodes.push(
        el('div', { class: 'row' }, [
          el('span', {}, [`Trial ${resolvedCount(run) + 1}/${run.trials.length}`]),
          button(`Play ${next.label}${run.reps > 1 ? ` (round ${(next.round ?? 0) + 1}/${run.reps})` : ''}`, handlers.onNextCalibrationTrial, {
            class: 'primary',
          }),
          button(`Skip ${next.label}`, () => handlers.onToggleExcluded(next.label)),
        ]),
      );
    }
    if (!run) return nodes;

    const { ranked, discarded } = rankResults(run);
    const best = done ? ranked[0] : undefined;
    if (ranked.length + discarded.length > 0) {
      nodes.push(
        el('table', { class: 'history' }, [
          el('thead', {}, [el('tr', {}, ['Config', 'PPS', 'Fin.', 'KPP', 'Score', ''].map((h) => el('th', {}, [h])))]),
          el('tbody', {}, [
            ...ranked.map((r) => resultRow(r, done, r === best, false)),
            ...discarded.map((r) => resultRow(r, done, false, true)),
          ]),
        ]),
      );
    }

    if (done && ranked.length > 1) {
      const confidence = winnerConfidence(ranked);
      const text = {
        single: 'One attempt per config: small gaps may be noise. Use 2-3 attempts for a reliable pick.',
        clear: `${ranked[0]!.label} won every attempt against the runner-up: a reliable difference.`,
        noise: `Score ranges overlap: ${ranked[0]!.label} and ${ranked[1]!.label} are within your own variance. Either is fine; prefer the one that feels better.`,
      }[confidence];
      nodes.push(el('p', { class: `note confidence ${confidence}` }, [text]));
    }

    const seen = new Set<string>();
    const skipped = run.trials.filter((t) => {
      if (seen.has(t.label) || !run.excluded.includes(t.label) || run.results.some((r) => r.label === t.label)) return false;
      seen.add(t.label);
      return true;
    });
    if (skipped.length > 0) {
      nodes.push(
        el('div', { class: 'row note' }, [
          'Skipped:',
          ...skipped.map((t) => button(`Restore ${t.label}`, () => handlers.onToggleExcluded(t.label))),
        ]),
      );
    }

    if (best) {
      nodes.push(
        el('div', { class: 'row' }, [
          button(`Apply best (${best.label})`, () => handlers.onApply(best.handling, best.label), { class: 'primary' }),
        ]),
      );
    } else if (done) {
      nodes.push(el('p', { class: 'note' }, ['Every config was skipped or discarded. Restore one or start a new calibration.']));
    }
    return nodes;
  }

  function upgradeView(s: TrainingState): Node[] {
    const p = s.upgrade;
    const target = p.unlocked;
    const level = UPGRADE_LADDER[target]!;
    const minPps = requiredPps(p, target);
    const nodes: Node[] = [
      el('p', { class: 'note' }, [
        `Climb toward competitive handling. Pass a level with finesse >= ${PASS_FINESSE_PCT}% `,
        'and at least 95% of your best PPS on the previous level.',
      ]),
    ];
    if (s.active?.kind === 'upgrade') nodes.push(activeBanner(s.active));

    nodes.push(
      el(
        'ol',
        { class: 'ladder' },
        UPGRADE_LADDER.map((l, i) => {
          const best = p.bestPps[i];
          const status = best != null ? '✓' : i === target ? '▶' : i < p.startLevel ? '–' : '·';
          return el('li', { class: i === target ? 'current' : '' }, [
            el('span', { class: 'status' }, [status]),
            el('span', { class: 'name' }, [l.name]),
            el('span', { class: 'note' }, [formatHandling(l.handling)]),
            el('span', { class: 'pps' }, [best != null ? `${best.toFixed(2)} pps` : '']),
          ]);
        }),
      ),
    );

    const goal = isLadderComplete(p)
      ? 'Ladder complete. Replay the last level to keep improving your PPS.'
      : `Next: ${level.name} (${formatHandling(level.handling)}). Need finesse >= ${PASS_FINESSE_PCT}%` +
        (minPps === null ? ' (this run sets your PPS baseline).' : ` and PPS >= ${minPps.toFixed(2)}.`);
    nodes.push(el('p', {}, [goal]));
    if (!s.active) {
      nodes.push(
        el('div', { class: 'row' }, [
          length,
          button(`Attempt ${level.name}`, () => handlers.onStartUpgrade(target, pieces()), { class: 'primary' }),
        ]),
      );
    }

    const last = p.lastAttempt;
    if (last) {
      nodes.push(
        el('div', { class: `attempt ${last.passed ? 'ok' : 'fault'}` }, [
          `${UPGRADE_LADDER[last.level]?.name ?? '?'}: ${last.pps.toFixed(2)} pps, ${last.finessePct.toFixed(1)}% finesse, `,
          `${formatDuration(last.replay.durationMs)}. ${last.reason}`,
          button('Replay', () => handlers.onPlayReplay(last.replay)),
        ]),
      );
    }

    const passed = highestPassed(p);
    nodes.push(
      el('div', { class: 'row' }, [
        ...(passed ? [button(`Apply ${passed.name}`, () => handlers.onApply(passed.handling, passed.name))] : []),
        button('Reset progress', handlers.onResetUpgrade),
      ]),
    );
    return nodes;
  }

  function render(): void {
    if (!state) return;
    renderTabs();
    const s = state;
    const views: Record<TrainingTab, () => Node[]> = {
      calibrate: () => calibrationView(s),
      upgrade: () => upgradeView(s),
      sprint: () => [
        ...(s.active?.kind === 'sprint' ? [activeBanner(s.active)] : []),
        ...sprintView(s.sprint, s.sprintTally, s.active?.kind === 'sprint', handlers),
      ],
      weak: () => [
        ...(s.active?.kind === 'weak' ? [activeBanner(s.active)] : []),
        ...weakSpotView(s.weakSpots, s.active?.kind === 'weak', s.allow180, handlers),
      ],
    };
    body.replaceChildren(...views[tab]());
  }

  return {
    render(next: TrainingState): void {
      state = next;
      if (next.active) tab = next.active.kind;
      render();
    },
  };
}
