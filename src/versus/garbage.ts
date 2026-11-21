/** Garbage cell color index (themes.ts). */
export const GARBAGE_CELL = 8;

import type { TSpinResult } from '../game/tSpin.js';
import { ATTACK_TABLES } from '../bot/botData.js';

/**
 * Lines cleared → garbage rows sent to opponent.
 * The numbers live in shared/versusAttack.json so the AssemblyScript CPU opponent plans against the very
 * same table (see src/bot/botData.ts for validation); this function only indexes it.
 */
export function attackRowsFromClear(linesCleared: number, tSpin: TSpinResult = 'none'): number {
  if (linesCleared <= 0) return 0;
  const table = tSpin === 'normal' ? ATTACK_TABLES.tSpin : tSpin === 'mini' ? ATTACK_TABLES.tSpinMini : ATTACK_TABLES.none;
  return table[Math.min(linesCleared, table.length - 1)]!;
}

/**
 * Inject garbage rows at the bottom of a 10×20 playfield (row 0 = top).
 * Each row has one random hole column. Returns true if blocks overflow the top.
 */
export function injectGarbageRows(
  playfield: Int8Array,
  width: number,
  height: number,
  rowCount: number,
  rng: () => number = Math.random,
): boolean {
  if (rowCount <= 0) return false;

  let overflow = false;
  for (let g = 0; g < rowCount; g++) {
    const holeCol = Math.floor(rng() * width);
    for (let y = 0; y < height - 1; y++) {
      const src = (y + 1) * width;
      const dst = y * width;
      for (let x = 0; x < width; x++) {
        playfield[dst + x] = playfield[src + x]!;
      }
    }
    const bottom = (height - 1) * width;
    for (let x = 0; x < width; x++) {
      playfield[bottom + x] = x === holeCol ? 0 : GARBAGE_CELL;
    }
    for (let x = 0; x < width; x++) {
      if (playfield[x] !== 0) {
        overflow = true;
        break;
      }
    }
  }
  return overflow;
}
