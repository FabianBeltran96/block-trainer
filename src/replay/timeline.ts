import { countHoles, boardAfter } from '../modes/sprint/analysis';
import { formatVerdict } from '../modes/finesse/verdict';
import type { PieceType } from '../engine';
import { simulationFor, type ReplayData } from './replay';

/** One placement in a replay, with what went wrong (if anything). */
export interface ReplayMark {
  /** Simulation ms at which the piece locked. */
  readonly t: number;
  readonly index: number;
  readonly piece: PieceType;
  readonly fault: boolean;
  readonly holes: number;
  readonly linesCleared: number;
  readonly verdict: string;
}

export const isIssue = (mark: ReplayMark): boolean => mark.fault || mark.holes > 0;

/** Plays the replay instantly and returns one mark per placement. */
export function analyzeReplay(replay: ReplayData): ReplayMark[] {
  const marks: ReplayMark[] = [];
  const simulation = simulationFor(replay, (event, verdict) => {
    if (event.type !== 'piecePlaced') return;
    marks.push({
      t: simulation.now,
      index: marks.length,
      piece: event.piece,
      fault: verdict?.kind === 'fault',
      holes: Math.max(0, countHoles(boardAfter(event.boardBefore, event.cells)) - countHoles(event.boardBefore)),
      linesCleared: event.linesCleared,
      verdict: verdict ? formatVerdict(verdict) : '',
    });
  });
  for (const input of replay.inputs) simulation.input(input.phase, input.action, input.t);
  simulation.advanceTo(replay.durationMs);
  return marks;
}

export function describeMark(mark: ReplayMark): string {
  const parts = [`#${mark.index + 1} ${mark.piece}`, mark.verdict];
  if (mark.holes > 0) parts.push(`+${mark.holes} hole${mark.holes > 1 ? 's' : ''}`);
  if (mark.linesCleared > 0) parts.push(`${mark.linesCleared} line${mark.linesCleared > 1 ? 's' : ''}`);
  return parts.filter(Boolean).join(' · ');
}
