import { describeMark, isIssue, type ReplayMark } from '../replay/timeline';
import { el } from './dom';

export const VIEWER_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export interface ReplayViewerHandlers {
  onTogglePause(): void;
  onPrevPiece(): void;
  onNextPiece(): void;
  onPrevIssue(): void;
  onNextIssue(): void;
  onSeek(timeMs: number): void;
  onSpeed(speed: number): void;
  onExit(): void;
}

export interface ReplayViewerState {
  readonly time: number;
  readonly paused: boolean;
  readonly done: boolean;
  /** Pieces placed so far. */
  readonly placed: number;
  readonly speed: number;
}

function formatClock(ms: number): string {
  const total = ms / 1000;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

/** Transport bar for replays: play/pause, piece stepping, issue jumps and a marked timeline. */
export function createReplayViewer(container: HTMLElement, handlers: ReplayViewerHandlers) {
  const button = (label: string, title: string, onClick: () => void) => {
    const b = el('button', { type: 'button', title }, [label]);
    b.addEventListener('click', () => {
      b.blur();
      onClick();
    });
    return b;
  };
  const playButton = button('Pause', 'Play / pause (Space)', handlers.onTogglePause);
  const speed = el(
    'select',
    { name: 'viewerSpeed', title: 'Playback speed' },
    VIEWER_SPEEDS.map((s) => el('option', { value: s }, [`${s}x`])),
  );
  speed.addEventListener('change', () => {
    speed.blur();
    handlers.onSpeed(Number(speed.value));
  });
  const info = el('span', { class: 'viewer-info' });
  const current = el('span', { class: 'viewer-piece note' });
  const fill = el('div', { class: 'timeline-fill' });
  const marksLayer = el('div', { class: 'timeline-marks' });
  const timeline = el('div', { class: 'timeline', title: 'Click to jump. Red = finesse fault, orange = new hole.' }, [
    fill,
    marksLayer,
  ]);

  let duration = 1;
  let marks: readonly ReplayMark[] = [];
  let last = '';

  timeline.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const markTime = target.dataset.t;
    if (markTime !== undefined) {
      handlers.onSeek(Number(markTime));
      return;
    }
    const rect = timeline.getBoundingClientRect();
    handlers.onSeek(((event.clientX - rect.left) / rect.width) * duration);
  });

  container.replaceChildren(
    el('div', { class: 'viewer-row' }, [
      button('◀ Issue', 'Previous fault or hole (Shift+←)', handlers.onPrevIssue),
      button('◀ Piece', 'Previous piece (←)', handlers.onPrevPiece),
      playButton,
      button('Piece ▶', 'Next piece (→)', handlers.onNextPiece),
      button('Issue ▶', 'Next fault or hole (Shift+→)', handlers.onNextIssue),
      speed,
      info,
      button('Exit', 'Back to live play (R)', handlers.onExit),
    ]),
    timeline,
    current,
  );
  container.hidden = true;

  return {
    show(durationMs: number, replayMarks: readonly ReplayMark[]): void {
      duration = Math.max(1, durationMs);
      marks = replayMarks;
      last = '';
      marksLayer.replaceChildren(
        ...marks.filter(isIssue).map((mark) =>
          el('div', {
            class: `timeline-mark ${mark.fault ? 'fault' : ''} ${mark.holes > 0 ? 'hole' : ''}`,
            style: `left: ${(mark.t / duration) * 100}%`,
            title: describeMark(mark),
            'data-t': mark.t,
          }),
        ),
      );
      container.hidden = false;
    },
    hide(): void {
      container.hidden = true;
    },
    update(state: ReplayViewerState): void {
      const issues = marks.filter((m) => m.index < state.placed && isIssue(m)).length;
      const key = `${Math.floor(state.time / 100)}|${state.paused}|${state.done}|${state.placed}|${state.speed}`;
      if (key === last) return;
      last = key;
      fill.style.width = `${Math.min(100, (state.time / duration) * 100)}%`;
      playButton.textContent = state.done ? 'Restart' : state.paused ? 'Play' : 'Pause';
      speed.value = String(state.speed);
      info.textContent =
        `${formatClock(state.time)} / ${formatClock(duration)} · piece ${state.placed}/${marks.length}` +
        ` · issues ${issues}/${marks.filter(isIssue).length}`;
      const mark = marks[state.placed - 1];
      current.textContent = mark ? `Last: ${describeMark(mark)}` : 'No piece placed yet.';
      current.classList.toggle('bad', mark !== undefined && isIssue(mark));
    },
  };
}
