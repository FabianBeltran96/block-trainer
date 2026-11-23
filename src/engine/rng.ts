import { PIECE_TYPES } from './pieces';
import type { PieceType } from './types';

/** mulberry32: small, fast, deterministic 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 7-bag randomizer: every consecutive group of 7 pieces contains each piece exactly once. */
export class SevenBag {
  private pending: PieceType[] = [];
  private readonly random: () => number;

  constructor(seed: number) {
    this.random = mulberry32(seed);
  }

  next(): PieceType {
    if (this.pending.length === 0) this.pending = this.shuffledBag();
    return this.pending.shift()!;
  }

  private shuffledBag(): PieceType[] {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    return bag;
  }
}
