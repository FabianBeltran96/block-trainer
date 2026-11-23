/// <reference lib="webworker" />
import { Board, type PieceType } from '../../engine';
import { planStack, type PlannedPlacement } from './planner';

export interface PlanRequest {
  readonly token: number;
  readonly cells: Uint8Array;
  readonly active: PieceType;
  readonly queue: readonly PieceType[];
  readonly hold: PieceType | null;
  readonly holdUsed: boolean;
  readonly count: number;
  readonly wellColumn: number;
}

export interface PlanResponse {
  readonly token: number;
  readonly plan: PlannedPlacement[];
  readonly ms: number;
}

/** Runs the stack planner off the main thread so rendering and input never stall. */
self.onmessage = (event: MessageEvent<PlanRequest>) => {
  const { token, cells, ...input } = event.data;
  const started = performance.now();
  const plan = planStack({ ...input, board: new Board(cells) });
  const response: PlanResponse = { token, plan, ms: performance.now() - started };
  self.postMessage(response);
};
