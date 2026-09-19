/**
 * Index compaction chore (pure logic + CPU rung).
 *
 * The line-clear burst emits a per-cell firework for every cell of every
 * cleared row. Under the adaptive particle budget most of those emits are
 * immediately thrown away by the ring buffer, so the interesting question is
 * *which* cells still get one. That is a compaction: 200 board flags in, a
 * dense list of spawn cell indices out.
 *
 * Only the indices come from the chore. Positions, colours, counts and every
 * gameplay decision stay exactly where they were — the chore feeds the juice,
 * it does not own it.
 */

/** Board geometry — the playfield is 10x20, same as `Game`. */
export const BOARD_COLS = 10;
export const BOARD_ROWS = 20;
export const BOARD_CELLS = BOARD_COLS * BOARD_ROWS;

/**
 * Compact a 0/1 flag array into the ascending list of set indices.
 *
 * Ascending order is part of the contract: the WGSL rung computes each output
 * slot from the number of set flags *before* it rather than from an atomic
 * bump, so both rungs produce byte-identical output and the CPU version is a
 * usable oracle for the GPU one.
 */
export function compactIndicesCpu(flags: ArrayLike<number>, maxOut = flags.length): Uint32Array {
  const limit = Math.max(0, Math.min(maxOut, flags.length));
  const out = new Uint32Array(limit);
  let n = 0;
  for (let i = 0; i < flags.length && n < limit; i++) {
    if (flags[i]) out[n++] = i;
  }
  return n === limit ? out : out.subarray(0, n);
}

export interface SpawnFlagOptions {
  /**
   * Current particle budget (`ParticleEmitter.maxParticles`, which the adaptive
   * controller scales down). At the default budget every occupied cell spawns,
   * so behaviour is unchanged until the frame budget is actually under pressure.
   */
  maxParticles?: number;
  /** Budget at or above which no thinning happens at all. */
  fullBudget?: number;
}

/**
 * Build the spawn-candidate flags for a set of cleared rows.
 *
 * A cell is a candidate when it is occupied in the pre-clear snapshot and
 * survives the budget stride. The stride is deterministic and phase-shifted per
 * row so a thinned burst still reads as a full row rather than a comb.
 */
export function buildSpawnFlags(
  rows: readonly number[],
  playfield: ReadonlyArray<ArrayLike<number>> | null | undefined,
  options: SpawnFlagOptions = {},
): Uint8Array {
  const flags = new Uint8Array(BOARD_CELLS);
  const stride = spawnStride(options);
  rows.forEach((row, rowOrder) => {
    if (!Number.isInteger(row) || row < 0 || row >= BOARD_ROWS) return;
    const cells = playfield?.[row];
    // A cleared row was full by definition, so an absent snapshot (headless,
    // versus mirror) *and* an already-emptied one both mean "every column".
    // Reading an emptied row literally would silently cancel the whole burst.
    const assumeFull = !cells || !rowHasContent(cells);
    for (let col = 0; col < BOARD_COLS; col++) {
      if (!assumeFull && !cells![col]) continue;
      if (stride > 1 && (col + rowOrder) % stride !== 0) continue;
      flags[row * BOARD_COLS + col] = 1;
    }
  });
  return flags;
}

function rowHasContent(cells: ArrayLike<number>): boolean {
  for (let col = 0; col < BOARD_COLS; col++) {
    if (cells[col]) return true;
  }
  return false;
}

/** Thinning stride implied by the particle budget: 1 (all cells), 2, or 3. */
export function spawnStride(options: SpawnFlagOptions = {}): number {
  const full = options.fullBudget ?? 3000;
  const budget = options.maxParticles;
  if (!Number.isFinite(budget) || budget === undefined || budget >= full) return 1;
  if (budget >= full / 2) return 2;
  return 3;
}

/** Decode a compacted cell index back to board coordinates. */
export function cellToRowCol(index: number): { row: number; col: number } {
  return { row: Math.floor(index / BOARD_COLS), col: index % BOARD_COLS };
}

/**
 * Membership lookup for the compacted list, for callers that keep their
 * existing `for (col of 0..9)` loop (the special-case triggers at column 5)
 * and only want to gate the emit itself.
 */
export function spawnLookup(indices: ArrayLike<number>): Uint8Array {
  const lookup = new Uint8Array(BOARD_CELLS);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx >= 0 && idx < BOARD_CELLS) lookup[idx] = 1;
  }
  return lookup;
}
