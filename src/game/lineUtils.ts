export function isPlayfieldEmpty(playfield: Int8Array): boolean {
  for (let i = 0; i < playfield.length; i++) {
    if (playfield[i] !== 0) return false;
  }
  return true;
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

    // Clear the remaining rows at the top
    if (targetY >= 0) {
        playfield.fill(0, 0, (targetY + 1) * playfieldWidth);
    }
  }

  return linesCleared;
}
