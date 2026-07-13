/** Playfield column → stereo pan helpers (no AudioContext). */

const PLAYFIELD_COLS = 10;

export function columnToPan(column: number, cols: number = PLAYFIELD_COLS): number {
  if (cols <= 1) return 0;
  const clamped = Math.max(0, Math.min(cols - 1, column));
  return (clamped / (cols - 1)) * 2 - 1;
}

export type MoveDirection = 'left' | 'right' | 'down';

export function movePan(direction: MoveDirection, column?: number, cols: number = PLAYFIELD_COLS): number {
  const base = column !== undefined ? columnToPan(column, cols) * 0.55 : 0;
  if (direction === 'left') return Math.max(-1, base - 0.35);
  if (direction === 'right') return Math.min(1, base + 0.35);
  return base;
}
