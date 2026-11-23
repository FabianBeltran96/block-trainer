import { Board, type PiecePlacedEvent } from '../../engine';
import { FINESSE_ACTION_LABEL, solveFinesse, type FinesseAction, type FinesseOptions } from './solver';

export type FinesseVerdict =
  | { readonly kind: 'ok'; readonly used: number; readonly optimal: number; readonly sequence: readonly FinesseAction[] }
  | { readonly kind: 'fault'; readonly used: number; readonly optimal: number; readonly sequence: readonly FinesseAction[] }
  | { readonly kind: 'skipped' };

export function evaluatePlacement(event: PiecePlacedEvent, options: FinesseOptions): FinesseVerdict {
  const solution = solveFinesse(new Board(event.boardBefore), event.piece, event.cells, options);
  if (!solution) return { kind: 'skipped' };
  const base = { used: event.inputCount, optimal: solution.inputs, sequence: solution.sequence };
  return event.inputCount > solution.inputs ? { kind: 'fault', ...base } : { kind: 'ok', ...base };
}

export function formatSequence(sequence: readonly FinesseAction[]): string {
  return sequence.length === 0 ? 'drop' : sequence.map((a) => FINESSE_ACTION_LABEL[a]).join(', ');
}

/** Exactly "OK" or "fault: used N, optimal M: <sequence>". */
export function formatVerdict(verdict: FinesseVerdict): string {
  switch (verdict.kind) {
    case 'ok':
      return 'OK';
    case 'fault':
      return `fault: used ${verdict.used}, optimal ${verdict.optimal}: ${formatSequence(verdict.sequence)}`;
    case 'skipped':
      return 'n/a: not reachable at spawn height (tuck or spin)';
  }
}
