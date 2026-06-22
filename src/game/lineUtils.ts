export function isPlayfieldEmpty(playfield: Int8Array): boolean {
  for (let i = 0; i < playfield.length; i++) {
    if (playfield[i] !== 0) return false;
  }
  return true;
}

/** Extract cleared row indices from a GPU line-clear mask (20 u32 slots). */
export function rowsFromClearMask(mask: Uint32Array, playfieldHeight: number = 20): number[] {
  const rows: number[] = [];
  for (let y = 0; y < playfieldHeight; y++) {
    if (mask[y]) rows.push(y);
  }
  return rows;
}

/** Shift playfield down after the given rows are removed (rows need not be sorted). */
export function compactClearedRows(
  playfield: Int8Array,
  playfieldWidth: number,
  playfieldHeight: number,
  rowsToClear: number[],
  outLinesCleared?: number[]
): number[] {
  const rows = rowsToClear.slice();
  const linesCleared: number[] = outLinesCleared || [];
  linesCleared.length = 0;
  for (let i = 0; i < rows.length; i++) {
    const y = rows[i];
    if (y >= 0 && y < playfieldHeight) linesCleared.push(y);
  }
  if (linesCleared.length === 0) return linesCleared;

  let targetY = playfieldHeight - 1;
  for (let y = playfieldHeight - 1; y >= 0; y--) {
    if (!linesCleared.includes(y)) {
      if (targetY !== y) {
        const targetStart = targetY * playfieldWidth;
        const sourceStart = y * playfieldWidth;
        playfield.copyWithin(targetStart, sourceStart, sourceStart + playfieldWidth);
      }
      targetY--;
    }
  }
  if (targetY >= 0) {
    playfield.fill(0, 0, (targetY + 1) * playfieldWidth);
  }
  return linesCleared;
}

export function clearFullLines(
  playfield: Int8Array,
  playfieldWidth: number,
  playfieldHeight: number,
  getCell: (x: number, y: number) => number,
  outLinesCleared?: number[]
): number[] {
  const linesCleared: number[] = outLinesCleared || [];
  linesCleared.length = 0;

  for (let y = 0; y < playfieldHeight; y++) {
    let full = true;
    for (let x = 0; x < playfieldWidth; x++) {
      if (getCell(x, y) === 0) {
        full = false;
        break;
      }
    }
    if (full) {
      linesCleared.push(y);
    }
  }

  if (linesCleared.length > 0) {
    compactClearedRows(playfield, playfieldWidth, playfieldHeight, linesCleared, linesCleared);
  }

  return linesCleared;
}
