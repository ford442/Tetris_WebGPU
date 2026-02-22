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
): number[] {
  const linesCleared: number[] = [];

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
    const newPlayfield = new Int8Array(playfieldWidth * playfieldHeight);
    let targetY = playfieldHeight - 1;

    for (let y = playfieldHeight - 1; y >= 0; y--) {
      if (!linesCleared.includes(y)) {
        const start = y * playfieldWidth;
        for (let k = 0; k < playfieldWidth; k++) {
          newPlayfield[targetY * playfieldWidth + k] = playfield[start + k];
        }
        targetY--;
      }
    }

    playfield.set(newPlayfield);
  }

  return linesCleared;
}
