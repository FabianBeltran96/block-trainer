import type { PlanInput, PlannedPlacement } from './planner';
import type { PlanRequest, PlanResponse } from './planner.worker';

/**
 * Asks the planner worker for a plan. Only the latest request is answered: a newer call
 * supersedes any request still in flight.
 */
export function createPlannerClient() {
  const worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
  let latest = 0;
  let pending: ((plan: PlannedPlacement[] | null) => void) | null = null;
  let lastMs = 0;

  worker.onmessage = (event: MessageEvent<PlanResponse>) => {
    if (event.data.token !== latest || !pending) return;
    lastMs = event.data.ms;
    const resolve = pending;
    pending = null;
    resolve(event.data.plan);
  };

  return {
    /** Resolves with the plan, or null when superseded or cancelled. */
    plan(input: PlanInput): Promise<PlannedPlacement[] | null> {
      pending?.(null);
      const token = ++latest;
      const { board, ...rest } = input;
      const request: PlanRequest = { ...rest, token, cells: new Uint8Array(board.cells) };
      return new Promise((resolve) => {
        pending = resolve;
        worker.postMessage(request);
      });
    },
    cancel(): void {
      latest++;
      pending?.(null);
      pending = null;
    },
    get lastMs(): number {
      return lastMs;
    },
  };
}
