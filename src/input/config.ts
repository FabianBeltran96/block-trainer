/** SDF value treated as "infinite": soft drop teleports to the floor without locking. */
export const SDF_INFINITE = 41;

/** Soft drop speed at SDF 1, in rows per second. Actual speed = SDF x this value. */
export const SOFT_DROP_BASE_ROWS_PER_SECOND = 1;

export interface HandlingConfig {
  /** Delayed Auto Shift: hold time before auto-repeat starts (ms). */
  readonly dasMs: number;
  /** Auto Repeat Rate: time between auto-repeat moves (ms). 0 = instant to wall. */
  readonly arrMs: number;
  /** DAS Cut Delay: pause in auto-shift after rotate/hold/hard drop while DAS is charged (ms). */
  readonly dcdMs: number;
  /** Soft Drop Factor: 1..40 multiplier, or 41 for infinite. */
  readonly sdf: number;
}

export const DEFAULT_HANDLING: HandlingConfig = {
  dasMs: 133,
  arrMs: 0,
  dcdMs: 17,
  sdf: SDF_INFINITE,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeHandling(input: unknown): HandlingConfig {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  return {
    dasMs: clampNumber(raw.dasMs, 0, 1000, DEFAULT_HANDLING.dasMs),
    arrMs: clampNumber(raw.arrMs, 0, 500, DEFAULT_HANDLING.arrMs),
    dcdMs: clampNumber(raw.dcdMs, 0, 500, DEFAULT_HANDLING.dcdMs),
    sdf: Math.round(clampNumber(raw.sdf, 1, SDF_INFINITE, DEFAULT_HANDLING.sdf)),
  };
}
