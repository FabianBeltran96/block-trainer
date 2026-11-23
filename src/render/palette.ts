import type { PieceType } from '../engine';

/** Flat, muted palette (original to this app). Index = board cell id. */
export const PIECE_COLORS: Readonly<Record<PieceType, string>> = {
  I: '#5cc8c2',
  J: '#5f7fd9',
  L: '#e49b5a',
  O: '#e6cf62',
  S: '#7cc47f',
  T: '#b07cd6',
  Z: '#e07070',
};

export const COLORS = {
  background: '#14161c',
  field: '#0c0d11',
  buffer: '#101218',
  grid: '#1d2029',
  border: '#3a3f4f',
  garbage: '#6b7080',
  text: '#a9afbf',
  dimmed: '#4a4f5c',
  well: 'rgba(92, 200, 194, 0.16)',
  issue: '#e07070',
} as const;
