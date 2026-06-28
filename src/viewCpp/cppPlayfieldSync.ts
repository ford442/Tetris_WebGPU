const COLS = 10;
const ROWS = 20;

/** Flatten projected playfield grid into 200 signed bytes for the C++ renderer. */
export function flattenPlayfieldGrid(playfield: number[][] | undefined): Int8Array {
  const out = new Int8Array(COLS * ROWS);
  if (!playfield) return out;

  let i = 0;
  for (let y = 0; y < ROWS; y++) {
    const row = playfield[y];
    for (let x = 0; x < COLS; x++) {
      const cell = row?.[x] ?? 0;
      out[i++] = Math.max(-127, Math.min(127, cell | 0));
    }
  }
  return out;
}

export const PLAYFIELD_CELL_COUNT = COLS * ROWS;
