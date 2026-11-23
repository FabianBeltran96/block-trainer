import './style.css';
import type { GameAction } from './input/actions';
import { bindKeyboard } from './input/keyboard';
import { ACTION_LABELS, BINDABLE_ACTIONS, keyName, toCodeMap, type Keymap } from './input/keymap';
import { CanvasRenderer } from './render/renderer';
import { createReplay, parseReplay, ReplayPlayer, type ReplayData } from './replay/replay';
import { analyzeReplay, describeMark, isIssue, type ReplayMark } from './replay/timeline';
import { createReplayViewer } from './ui/replayViewer';
import { Simulation, type SimulationListener } from './replay/simulation';
import { addSession, loadHistory, summarize } from './storage/historyStore';
import { browserStorage } from './storage/keyValue';
import { addReplay, loadReplays } from './storage/replayStore';
import { loadKeymap, saveKeymap } from './storage/keymapStore';
import { loadSettings, saveSettings, type TrainerSettings } from './storage/settingsStore';
import { createFeedback } from './ui/feedback';
import { createHistoryPanel } from './ui/historyPanel';
import { createKeymapPanel } from './ui/keymapPanel';
import { createReplaysPanel } from './ui/replaysPanel';
import { createSettingsPanel } from './ui/settingsPanel';
import { createStatsPanel } from './ui/statsPanel';
import { createSidebarTabs } from './ui/sidebarTabs';
import { createTrainingPanel, type TrainingTab } from './ui/trainingPanel';
import {
  createCalibration,
  isCalibrationDone,
  nextCalibrationTrial,
  toggleExcluded,
  type CalibrationRun,
} from './modes/training/calibration';
import { toTrialResult, type TrialResult, type TrialSpec } from './modes/training/trial';
import { initialProgress, recordAttempt, UPGRADE_LADDER, type UpgradeProgress } from './modes/training/upgrade';
import { analyzePlacement, addToTally, EMPTY_TALLY, tetrisRate, type SprintTally } from './modes/sprint/analysis';
import { findLayout, SPRINT_LINES } from './modes/sprint/layouts';
import {
  drawablePlan,
  LOOKAHEAD_PIECES,
  OPENER_PIECES,
  sameCells,
  type PlannedPlacement,
} from './modes/sprint/planner';
import type { SprintGuide } from './modes/sprint/guide';
import { createPlannerClient } from './modes/sprint/plannerClient';
import { addSprintRun, loadSprint, saveSprint, type SprintData } from './storage/sprintStore';
import { formatSequence, formatVerdict, type FinesseVerdict } from './modes/finesse/verdict';
import type { PiecePlacedEvent, PieceType } from './engine';
import { patternOf, patternSolution, targetCells, type Pattern } from './modes/weakspots/patterns';
import { buildDrill, DRILL_PATTERNS, rankWeakSpots, recordOutcome, summarizeDrill } from './modes/weakspots/weakSpots';
import { EMPTY_WEAK_SPOTS, loadWeakSpots, saveWeakSpots, type WeakSpotData } from './storage/weakSpotStore';
import { loadCalibration, loadUpgrade, saveCalibration, saveUpgrade } from './storage/trainingStore';
import type { HandlingConfig } from './input/config';
import { ENGINE_VERSION } from './engine';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

const storage = browserStorage();
let settings: TrainerSettings = loadSettings(storage);
let keymap: Keymap = loadKeymap(storage);
let codeMap = toCodeMap(keymap);
const keysHint = byId('keys-hint');

function renderKeysHint(): void {
  keysHint.textContent = BINDABLE_ACTIONS.map(
    (action) => `${ACTION_LABELS[action]}: ${keymap[action].map(keyName).join(' / ') || '—'}`,
  ).join(' · ');
}

const boardCanvas = byId<HTMLCanvasElement>('board');
const renderer = new CanvasRenderer(boardCanvas);
const boardWrap = byId('board-wrap');

/** Scales the playfield to the largest size that fits its area, keeping the aspect ratio. */
function fitBoard(): void {
  const ratio = boardCanvas.width / boardCanvas.height;
  const { width, height } = boardWrap.getBoundingClientRect();
  boardCanvas.style.width = `${Math.floor(Math.min(width, height * ratio))}px`;
}
new ResizeObserver(fitBoard).observe(boardWrap);

const sidebarTabs = createSidebarTabs(
  byId('sidebar-tabs'),
  [...document.querySelectorAll<HTMLElement>('.sidebar-body > [data-pane]')],
  browserStorage(),
);
const feedback = createFeedback(byId('feedback'));
const stats = createStatsPanel(byId('stats'));
const historyPanel = createHistoryPanel(byId('history'));
const modeStatus = byId('mode-status');

const modeTag = document.querySelector<HTMLElement>('.mode-tag');

interface ActiveTrial {
  readonly kind: TrainingTab;
  readonly spec: TrialSpec;
  /** New random seed on every (re)start instead of the spec seed. */
  readonly freshSeed?: boolean;
  /** Isolated-placement drill pieces (empty board after each piece, no hold). */
  readonly drillQueue?: readonly PieceType[];
  /** The mode files weak-spot outcomes itself instead of the generic per-placement tracking. */
  readonly tracksPatterns?: boolean;
  onStart?(): void;
  onPlaced?(event: PiecePlacedEvent, verdict: FinesseVerdict | null): void;
  onSpawn?(): void;
  onComplete(result: TrialResult): void;
}

function linesCleared(simulation: Simulation): number {
  return simulation.placements.reduce((sum, p) => sum + p.linesCleared, 0);
}

function isTrialComplete(simulation: Simulation, spec: TrialSpec): boolean {
  return spec.lines !== undefined ? linesCleared(simulation) >= spec.lines : simulation.placements.length >= spec.pieces;
}

function trialProgress(simulation: Simulation, spec: TrialSpec): string {
  return spec.lines !== undefined
    ? `${linesCleared(simulation)}/${spec.lines} lines`
    : `${simulation.placements.length}/${spec.pieces}`;
}

type Mode =
  | { kind: 'live'; simulation: Simulation; startedAt: number; saved: boolean; trial: ActiveTrial | null; ended: boolean }
  | { kind: 'replay'; player: ReplayPlayer; marks: readonly ReplayMark[] };

const held = new Set<GameAction>();
let mode: Mode;

const listener: SimulationListener = (event, verdict) => {
  if (verdict) feedback.showVerdict(verdict);
  if (mode?.kind !== 'live') return;
  if (event.type === 'piecePlaced' && !mode.ended && !mode.trial?.tracksPatterns) trackPattern(event, verdict);
  if (mode.trial) {
    if (mode.ended) return;
    const live = mode;
    if (event.type === 'piecePlaced') live.trial!.onPlaced?.(event, verdict);
    if (event.type === 'spawn') live.trial!.onSpawn?.();
    if (event.type === 'topOut' || isTrialComplete(live.simulation, live.trial!.spec)) {
      queueMicrotask(() => finishTrial(live));
    } else if (event.type === 'piecePlaced') {
      queueMicrotask(renderTraining);
    }
    return;
  }
  if (event.type === 'topOut') saveRun();
  else if (event.type === 'piecePlaced') renderTraining();
};

// --- Weak spots: finesse faults by piece / orientation / column ---------------

let weakSpots: WeakSpotData = loadWeakSpots(storage);

function fileOutcome(pattern: Pattern, fault: boolean): void {
  weakSpots = { ...weakSpots, stats: recordOutcome(weakSpots.stats, pattern, fault) };
  saveWeakSpots(storage, weakSpots);
}

/** Files every evaluated placement; tucks and spins (no spawn-height finesse) are skipped. */
function trackPattern(event: PiecePlacedEvent, verdict: FinesseVerdict | null): void {
  if (!verdict || verdict.kind === 'skipped') return;
  fileOutcome(patternOf(event.piece, event.cells), verdict.kind === 'fault');
}

function startLiveRun(trial: ActiveTrial | null = null): void {
  held.clear();
  const { gravity, allow180 } = settings;
  const handling = trial ? trial.spec.handling : settings.handling;
  const seed = trial && !trial.freshSeed ? trial.spec.seed : randomSeed();
  mode = {
    kind: 'live',
    simulation: new Simulation(
      { seed, handling, gravity, allow180, ...(trial?.drillQueue ? { drillQueue: trial.drillQueue } : {}) },
      listener,
    ),
    startedAt: performance.now(),
    saved: false,
    trial,
    ended: false,
  };
  renderer.setGuide(null);
  replayViewer.hide();
  keysHint.hidden = false;
  trial?.onStart?.();
  const goal = trial?.spec.lines !== undefined ? `clear ${trial.spec.lines} lines` : `place ${trial?.spec.pieces} pieces`;
  feedback.showMessage(trial ? `${trial.spec.label}: ${goal}.` : 'Place pieces with minimal inputs.');
  modeStatus.textContent = '';
  const tags: Record<TrainingTab, string> = {
    calibrate: 'Calibration',
    upgrade: 'Upgrade',
    sprint: 'Sprint 40L',
    weak: 'Weak-spot drill',
  };
  if (modeTag) modeTag.textContent = trial ? tags[trial.kind] : 'Finesse drill';
  replaysPanel.setPlaying(false);
  if (trial) sidebarTabs.select('Training');
  renderTraining();
}

/** Ends a training trial: stores its replay + session, then hands the result to the mode. */
function finishTrial(live: Extract<Mode, { kind: 'live' }>): void {
  if (live.ended || !live.trial || mode !== live) return;
  live.ended = true;
  live.saved = true;
  held.clear();
  const { simulation, trial } = live;
  simulation.session.end(simulation.now);
  const stats = simulation.session.stats(simulation.now);
  const replay = createReplay(simulation);
  historyPanel.render(addSession(storage, summarize(stats)));
  replaysPanel.render(addReplay(storage, replay));
  feedback.showMessage(`${trial.spec.label} done: ${stats.pps.toFixed(2)} pps, ${stats.finessePct.toFixed(1)}% finesse.`);
  renderer.setGuide(null);
  trial.onComplete(toTrialResult(trial.spec, stats, replay));
  renderTraining();
}

/** Persists the session summary and replay of the current live run (once). */
function saveRun(): void {
  if (mode.kind !== 'live' || mode.saved || mode.trial) return;
  mode.saved = true;
  const { simulation } = mode;
  simulation.session.end(simulation.now);
  if (simulation.placements.length === 0) return;
  historyPanel.render(addSession(storage, summarize(simulation.session.stats(simulation.now))));
  replaysPanel.render(addReplay(storage, createReplay(simulation)));
}

function restart(): void {
  if (mode.kind === 'live' && mode.trial && !mode.ended) {
    startLiveRun(mode.trial);
    return;
  }
  saveRun();
  startLiveRun();
}

function playReplay(replay: ReplayData, speed: number): void {
  saveRun();
  held.clear();
  const marks = analyzeReplay(replay);
  mode = { kind: 'replay', player: new ReplayPlayer(replay, speed, listener), marks };
  renderer.setGuide(null);
  const warning = replay.engineVersion === ENGINE_VERSION ? '' : ` (recorded on engine ${replay.engineVersion})`;
  modeStatus.textContent = `Replay${warning}. ←/→ piece · Shift+←/→ issue · Space pause · R exit.`;
  if (modeTag) modeTag.textContent = 'Replay';
  replaysPanel.setPlaying(true);
  replayViewer.show(replay.durationMs, marks);
  keysHint.hidden = true;
}

// --- Replay viewer controls ------------------------------------------------------

function replayMode(): Extract<Mode, { kind: 'replay' }> | null {
  return mode.kind === 'replay' ? mode : null;
}

/** Jumps to a time and reports the piece placed last, so stepping reads like a review. */
function seekReplay(timeMs: number, pause = true): void {
  const replay = replayMode();
  if (!replay) return;
  replay.player.seek(timeMs);
  if (pause) replay.player.paused = true;
  const mark = replay.marks[replay.player.simulation.placements.length - 1];
  if (!mark) feedback.showMessage('Start of replay.');
  else if (isIssue(mark)) feedback.showIssue(describeMark(mark));
  else feedback.showMessage(describeMark(mark));
}

/** Time right after `count` pieces have been placed (0 = start). */
function timeAfterPieces(marks: readonly ReplayMark[], count: number): number {
  return count <= 0 ? 0 : marks[Math.min(count, marks.length) - 1]!.t;
}

const replayControls = {
  onTogglePause() {
    const replay = replayMode();
    if (!replay) return;
    if (replay.player.done) {
      seekReplay(0, false);
      replay.player.paused = false;
    } else {
      replay.player.paused = !replay.player.paused;
    }
  },
  onPrevPiece() {
    const replay = replayMode();
    if (replay) seekReplay(timeAfterPieces(replay.marks, replay.player.simulation.placements.length - 1));
  },
  onNextPiece() {
    const replay = replayMode();
    if (replay) seekReplay(timeAfterPieces(replay.marks, replay.player.simulation.placements.length + 1));
  },
  onPrevIssue() {
    const replay = replayMode();
    if (!replay) return;
    const placed = replay.player.simulation.placements.length;
    const mark = [...replay.marks].reverse().find((m) => m.index < placed - 1 && isIssue(m));
    seekReplay(mark ? mark.t : 0);
  },
  onNextIssue() {
    const replay = replayMode();
    if (!replay) return;
    const placed = replay.player.simulation.placements.length;
    const mark = replay.marks.find((m) => m.index >= placed && isIssue(m));
    if (mark) seekReplay(mark.t);
    else feedback.showMessage('No more issues after this point.');
  },
  onSeek(timeMs: number) {
    const replay = replayMode();
    if (replay) seekReplay(timeMs, replay.player.paused);
  },
  onSpeed(speed: number) {
    const replay = replayMode();
    if (replay) replay.player.speed = speed;
  },
  onExit() {
    if (mode.kind === 'replay') startLiveRun();
  },
};
const replayViewer = createReplayViewer(byId('replay-viewer'), replayControls);

window.addEventListener('keydown', (event) => {
  if (mode.kind !== 'replay') return;
  if ((event.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
  const actions: Record<string, (() => void) | undefined> = {
    Space: event.repeat ? undefined : replayControls.onTogglePause,
    ArrowLeft: event.shiftKey ? replayControls.onPrevIssue : replayControls.onPrevPiece,
    ArrowRight: event.shiftKey ? replayControls.onNextIssue : replayControls.onNextPiece,
  };
  const action = actions[event.code];
  if (!action) return;
  event.preventDefault();
  action();
});

function exportReplay(replay: ReplayData): void {
  const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `block-trainer-replay-${replay.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importReplay(file: File): Promise<void> {
  try {
    const replay = parseReplay(JSON.parse(await file.text()) as unknown);
    replaysPanel.render(addReplay(storage, replay));
    replaysPanel.setStatus(`Imported ${file.name}.`);
  } catch (error) {
    replaysPanel.setStatus(error instanceof Error ? error.message : 'Import failed.');
  }
}

const replaysPanel = createReplaysPanel(byId('replays'), {
  onPlay: playReplay,
  onStop: () => startLiveRun(),
  onExport: exportReplay,
  onImport: (file) => void importReplay(file),
});

function mountSettingsPanel(): void {
  createSettingsPanel(byId('settings'), settings, {
    onApply(next) {
      settings = next;
      saveSettings(storage, settings);
      saveRun();
      startLiveRun();
      feedback.showMessage('Settings saved. New run started.');
    },
    onRestart: restart,
  });
}
mountSettingsPanel();

// --- Training modes -------------------------------------------------------

let calibration: CalibrationRun | null = loadCalibration(storage);
let upgrade: UpgradeProgress = loadUpgrade(storage) ?? initialProgress(settings.handling);

function runCalibrationTrial(): void {
  const spec = calibration && nextCalibrationTrial(calibration);
  if (!spec) return;
  saveRun();
  startLiveRun({
    kind: 'calibrate',
    spec,
    onComplete(result) {
      if (!calibration) return;
      calibration = { ...calibration, results: [...calibration.results, result] };
      saveCalibration(storage, calibration);
      if (isCalibrationDone(calibration)) feedback.showMessage('Calibration complete. Check the ranking in Training.');
    },
  });
}

function applyHandling(handling: HandlingConfig, label: string): void {
  settings = { ...settings, handling };
  saveSettings(storage, settings);
  mountSettingsPanel();
  saveRun();
  startLiveRun();
  feedback.showMessage(`Applied ${label} handling to your settings.`);
}

const trainingPanel = createTrainingPanel(byId('training'), {
  onStartCalibration(pieces, reps) {
    calibration = createCalibration(settings.handling, pieces, randomSeed(), reps);
    saveCalibration(storage, calibration);
    runCalibrationTrial();
  },
  onNextCalibrationTrial: runCalibrationTrial,
  onToggleExcluded(label) {
    if (!calibration) return;
    calibration = toggleExcluded(calibration, label);
    saveCalibration(storage, calibration);
    // Skipping the config being played stops that trial.
    if (mode.kind === 'live' && mode.trial?.kind === 'calibrate' && !mode.ended && mode.trial.spec.label === label) {
      startLiveRun();
      feedback.showMessage(`${label} skipped.`);
    }
    renderTraining();
  },
  onStartUpgrade(level, pieces) {
    const target = UPGRADE_LADDER[level];
    if (!target) return;
    saveRun();
    startLiveRun({
      kind: 'upgrade',
      spec: { label: target.name, handling: target.handling, seed: randomSeed(), pieces },
      onComplete(result) {
        upgrade = recordAttempt(upgrade, level, result);
        saveUpgrade(storage, upgrade);
      },
    });
  },
  onResetUpgrade() {
    upgrade = initialProgress(settings.handling);
    saveUpgrade(storage, upgrade);
    renderTraining();
  },
  onApply: applyHandling,
  onPlayReplay: (replay) => playReplay(replay, 1),
  onStop: () => startLiveRun(),
  onSelectLayout(layoutId) {
    sprint = { ...sprint, layoutId: findLayout(layoutId).id };
    saveSprint(storage, sprint);
    renderTraining();
  },
  onStartSprint: startSprint,
  onSelectGuide(guide) {
    sprint = { ...sprint, guide };
    saveSprint(storage, sprint);
    // A running sprint picks the new mode up on its next piece.
    renderTraining();
  },
  onStartDrill: startDrill,
  onResetWeakSpots() {
    if (!window.confirm('Reset all weak-spot stats?')) return;
    weakSpots = EMPTY_WEAK_SPOTS;
    saveWeakSpots(storage, weakSpots);
    renderTraining();
  },
});

// --- Weak-spot drill ----------------------------------------------------------

/**
 * Repeats the weakest patterns one piece at a time on an empty board. A rep is clean only
 * when the piece lands on the target ghost with optimal finesse.
 */
function startDrill(reps: number): void {
  const patterns = rankWeakSpots(weakSpots.stats)
    .slice(0, DRILL_PATTERNS)
    .map((spot) => spot.pattern);
  if (patterns.length === 0) return;
  const targets = buildDrill(patterns, reps, randomSeed());
  const optimal = (pattern: Pattern) => {
    const solution = patternSolution(pattern, settings.allow180);
    return solution ? formatSequence(solution.sequence) : '?';
  };
  let results: boolean[] = [];

  function showTarget(): void {
    const target = targets[results.length];
    renderer.setGuide(
      target ? { wellColumn: null, highlight: [], plan: [{ type: target.type, cells: targetCells(target), viaHold: false }] } : null,
    );
  }

  saveRun();
  startLiveRun({
    kind: 'weak',
    spec: { label: 'Weak-spot drill', handling: settings.handling, seed: randomSeed(), pieces: targets.length },
    drillQueue: targets.map((t) => t.type),
    tracksPatterns: true,
    onStart() {
      results = [];
      showTarget();
    },
    onSpawn: showTarget,
    onPlaced(event, verdict) {
      const target = targets[results.length];
      if (!target) return;
      const hit = sameCells(event.cells, targetCells(target));
      const fault = !hit || verdict?.kind === 'fault';
      results = [...results, !fault];
      fileOutcome(target, fault);
      if (!hit) feedback.showIssue(`missed target · optimal: ${optimal(target)}`);
      else if (verdict?.kind === 'fault') feedback.showIssue(`${formatVerdict(verdict)}`);
      else feedback.showMessage(`clean · ${results.filter(Boolean).length}/${results.length}`);
    },
    onComplete(result) {
      const summary = summarizeDrill(targets, results);
      weakSpots = { ...weakSpots, lastDrill: summary };
      saveWeakSpots(storage, weakSpots);
      feedback.showMessage(
        `Drill done: ${summary.clean}/${summary.reps} clean (on target, optimal inputs) · ${result.pps.toFixed(2)} pps.`,
      );
    },
  });
}

// --- Sprint 40L stacking drill ------------------------------------------------

let sprint: SprintData = loadSprint(storage);
let sprintTally: SprintTally | null = null;
let plan: PlannedPlacement[] = [];
let issueCells: PiecePlacedEvent['cells'] = [];
/** Set when the last piece followed the plan: the rest of the plan stays valid, no search needed. */
let keepPlan = false;
/** "After mistakes" guide: the last placement created a hole or blocked the well. */
let needHint = false;
const planner = createPlannerClient();

function startSprint(layoutId: string): void {
  const layout = findLayout(layoutId);
  const guide = (): SprintGuide => sprint.guide;

  /** The part of the plan the current guide mode shows. */
  function visiblePlan(): PlannedPlacement[] {
    switch (guide()) {
      case 'opener':
      case 'always':
        return drawablePlan(plan);
      case 'next':
        return plan.slice(0, 1);
      case 'recovery':
        return needHint ? plan.slice(0, 1) : [];
      case 'off':
        return [];
    }
  }

  function updateGuide(): void {
    renderer.setGuide({ wellColumn: layout.wellColumn, highlight: issueCells, plan: visiblePlan() });
  }

  function lookahead(placed: number): number {
    switch (guide()) {
      case 'opener':
        return Math.max(0, OPENER_PIECES - placed);
      case 'recovery':
        return needHint ? LOOKAHEAD_PIECES : 0;
      case 'off':
        return 0;
      default:
        return LOOKAHEAD_PIECES;
    }
  }

  /**
   * Recomputes the plan for the piece in play. The search runs in a separate task so the
   * keystroke that spawned the piece is never delayed; until it finishes, the remaining part of
   * a followed plan stays on screen.
   */
  function replan(): void {
    if (mode.kind !== 'live') return;
    const live = mode;
    const count = lookahead(live.simulation.placements.length);
    if (keepPlan && guide() === 'opener') {
      keepPlan = false;
      const nextStep = plan[0];
      const active = live.simulation.engine.snapshot().active;
      if (!nextStep || (!nextStep.viaHold && nextStep.type === active?.type)) {
        updateGuide();
        return;
      }
    }
    keepPlan = false;
    const snapshot = live.simulation.engine.snapshot();
    if (count === 0 || !snapshot.active) {
      planner.cancel();
      plan = [];
      updateGuide();
      return;
    }
    updateGuide();
    const placed = live.simulation.placements.length;
    void planner
      .plan({
        board: snapshot.board,
        active: snapshot.active.type,
        queue: snapshot.next,
        hold: snapshot.hold,
        holdUsed: snapshot.holdUsed,
        count,
        wellColumn: layout.wellColumn,
      })
      .then((result) => {
        // Drop answers for a board that is gone (piece placed, run restarted or ended).
        if (!result || mode !== live || live.ended || live.simulation.placements.length !== placed) return;
        plan = result;
        updateGuide();
      });
  }

  sprint = { ...sprint, layoutId: layout.id };
  saveSprint(storage, sprint);
  saveRun();
  startLiveRun({
    kind: 'sprint',
    spec: { label: `${layout.name} 40L`, handling: settings.handling, seed: randomSeed(), pieces: Number.MAX_SAFE_INTEGER, lines: SPRINT_LINES },
    freshSeed: true,
    onStart() {
      sprintTally = EMPTY_TALLY;
      issueCells = [];
      plan = [];
      keepPlan = false;
      needHint = false;
      replan();
    },
    onSpawn: replan,
    onPlaced(event, verdict) {
      const issues = analyzePlacement(event, layout.wellColumn);
      sprintTally = addToTally(sprintTally ?? EMPTY_TALLY, event, issues);
      // Highlight is skipped after a clear because the rows have shifted.
      issueCells = event.linesCleared > 0 ? [] : issues.cells;
      const shown = visiblePlan().length > 0;
      const target = plan[0];
      const onPlan = target !== undefined && sameCells(event.cells, target.cells);
      const planNote = shown ? (onPlan ? 'on plan' : 'off plan') : null;
      plan = onPlan ? plan.slice(1) : [];
      keepPlan = onPlan;
      const problems = [
        ...(issues.wellViolation ? ['well blocked'] : []),
        ...(issues.holesCreated > 0 ? [`+${issues.holesCreated} hole${issues.holesCreated > 1 ? 's' : ''}`] : []),
      ];
      needHint = problems.length > 0;
      updateGuide();
      const hint = needHint && guide() === 'recovery' ? 'hint shown for the next piece' : '';
      const text = [verdict ? formatVerdict(verdict) : '', planNote ?? '', ...problems, hint].filter(Boolean).join(' · ');
      if (problems.length > 0) feedback.showIssue(text);
      else if (planNote) feedback.showMessage(text);
    },
    onComplete(result) {
      const tally = sprintTally ?? EMPTY_TALLY;
      sprint = addSprintRun(
        sprint,
        {
          layoutId: layout.id,
          date: new Date().toISOString(),
          completed: tally.lines >= SPRINT_LINES,
          durationMs: result.durationMs,
          pieces: result.pieces,
          lines: tally.lines,
          pps: result.pps,
          finessePct: result.finessePct,
          tetrisPct: tetrisRate(tally),
          wellViolations: tally.wellViolations,
          holes: tally.holes,
        },
        result.replay,
      );
      saveSprint(storage, sprint);
      sprintTally = null;
    },
  });
}

function renderTraining(): void {
  const trial = mode?.kind === 'live' && mode.trial && !mode.ended ? mode : null;
  trainingPanel.render({
    calibration,
    upgrade,
    active: trial
      ? {
          kind: trial.trial!.kind,
          label: trial.trial!.spec.label,
          progress: trialProgress(trial.simulation, trial.trial!.spec),
          ...(trial.trial!.kind === 'calibrate' && calibration && calibration.reps > 1
            ? { detail: `round ${(trial.trial!.spec.round ?? 0) + 1}/${calibration.reps}` }
            : {}),
        }
      : null,
    sprint,
    sprintTally,
    weakSpots,
    allow180: settings.allow180,
  });
}

createKeymapPanel(byId('controls'), keymap, {
  onChange(next) {
    keymap = next;
    codeMap = toCodeMap(keymap);
    saveKeymap(storage, keymap);
    renderKeysHint();
  },
});
renderKeysHint();

historyPanel.render(loadHistory(storage));
replaysPanel.render(loadReplays(storage));
startLiveRun();

bindKeyboard(window, {
  onAction(action, phase, timeStamp) {
    if (action === 'restart') {
      if (phase === 'down') restart();
      return;
    }
    if (mode.kind !== 'live' || mode.ended) return;
    if (phase === 'down') held.add(action);
    else held.delete(action);
    mode.simulation.input(phase, action, timeStamp - mode.startedAt);
  },
  onBlur() {
    if (mode.kind !== 'live') return;
    mode.simulation.releaseAll(performance.now() - mode.startedAt, held);
    held.clear();
  },
}, () => codeMap);

window.addEventListener('pagehide', saveRun);

function currentSimulation(): Simulation {
  return mode.kind === 'live' ? mode.simulation : mode.player.simulation;
}

let lastFrame = performance.now();
function frame(now: number): void {
  const dt = Math.max(0, now - lastFrame);
  lastFrame = now;
  if (mode.kind === 'live') {
    if (!mode.ended) mode.simulation.advanceTo(now - mode.startedAt);
  } else {
    const { player } = mode;
    player.step(dt);
    replayViewer.update({
      time: player.time,
      paused: player.paused,
      done: player.done,
      placed: player.simulation.placements.length,
      speed: player.speed,
    });
  }
  renderer.draw(currentSimulation().engine.snapshot());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(() => {
  const simulation = currentSimulation();
  stats.update(simulation.session.stats(simulation.now));
}, 100);
