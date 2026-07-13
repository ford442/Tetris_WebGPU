/** Garbage cell color index (themes.ts). */
export const GARBAGE_CELL = 8;

/** Lines cleared → garbage rows sent to opponent. */
export function attackRowsFromClear(linesCleared: number): number {
  if (linesCleared <= 0) return 0;
  if (linesCleared === 1) return 0;
  if (linesCleared === 2) return 1;
  if (linesCleared === 3) return 2;
  return 4;
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
        playfield[dst + x] = playfield[src + x];
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
