import { describe, expect, it } from 'vitest';
import {
  BOARD_CELLS,
  BOARD_COLS,
  buildSpawnFlags,
  cellToRowCol,
  compactIndicesCpu,
  spawnLookup,
  spawnStride,
} from '../src/webgpu/gpuChores/compact.js';
import { CompactIndicesShader } from '../src/webgpu/gpuChores/shaders.js';

/**
 * Per-thread slot rule the WGSL kernel implements: a surviving invocation
 * counts the set flags before it rather than bumping an atomic. Mirrored here
 * so the GPU rung's ordering contract is pinned by a test, not only by review.
 */
function compactLikeWgsl(flags: ArrayLike<number>, maxOut: number): Uint32Array {
  const out = new Uint32Array(Math.min(maxOut, flags.length));
  let produced = 0;
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    let slot = 0;
    for (let j = 0; j < i; j++) if (flags[j]) slot += 1;
    if (slot < maxOut) {
      out[slot] = i;
      produced = Math.max(produced, slot + 1);
    }
  }
  return out.subarray(0, produced);
}

describe('compactIndicesCpu', () => {
  it('returns the set indices in ascending order', () => {
    expect(Array.from(compactIndicesCpu([0, 1, 0, 0, 1, 1]))).toEqual([1, 4, 5]);
  });

  it('returns nothing for an all-clear flag buffer', () => {
    expect(compactIndicesCpu(new Uint8Array(32)).length).toBe(0);
  });

  it('respects the output limit', () => {
    const flags = new Uint8Array(64).fill(1);
    expect(Array.from(compactIndicesCpu(flags, 3))).toEqual([0, 1, 2]);
  });

  it('agrees with the WGSL slot rule on random inputs', () => {
    let seed = 1337;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let trial = 0; trial < 40; trial++) {
      const flags = Uint8Array.from({ length: BOARD_CELLS }, () => (rand() < 0.35 ? 1 : 0));
      const limit = trial % 3 === 0 ? 17 : BOARD_CELLS;
      expect(Array.from(compactIndicesCpu(flags, limit)))
        .toEqual(Array.from(compactLikeWgsl(flags, limit)));
    }
  });

  it('is pinned to a prefix count in the kernel, not an atomic slot bump', () => {
    // An atomicAdd-assigned slot would be order-dependent and could not be
    // compared against the CPU rung at all.
    expect(CompactIndicesShader).toContain('for (var j = 0u; j < i; j = j + 1u)');
    expect(CompactIndicesShader).not.toMatch(/let\s+slot\s*=\s*atomicAdd/);
  });
});

describe('buildSpawnFlags', () => {
  const fullRow = () => Array(BOARD_COLS).fill(3);

  it('spawns every column of a cleared row at the full particle budget', () => {
    const playfield = Array.from({ length: 20 }, () => fullRow());
    const flags = buildSpawnFlags([18, 19], playfield, { maxParticles: 5000 });
    const cells = compactIndicesCpu(flags);
    expect(cells.length).toBe(BOARD_COLS * 2);
    expect(Array.from(cells.slice(0, BOARD_COLS))).toEqual(
      Array.from({ length: BOARD_COLS }, (_, c) => 18 * BOARD_COLS + c),
    );
  });

  it('treats an already-emptied snapshot as a full row rather than cancelling the burst', () => {
    const playfield = Array.from({ length: 20 }, () => Array(BOARD_COLS).fill(0));
    const flags = buildSpawnFlags([5], playfield, { maxParticles: 5000 });
    expect(compactIndicesCpu(flags).length).toBe(BOARD_COLS);
  });

  it('treats a missing snapshot as a full row', () => {
    expect(compactIndicesCpu(buildSpawnFlags([5], null)).length).toBe(BOARD_COLS);
  });

  it('skips holes in a partially occupied row', () => {
    const row = fullRow();
    row[3] = 0;
    row[7] = 0;
    const playfield = Array.from({ length: 20 }, () => fullRow());
    playfield[9] = row;
    const cols = Array.from(compactIndicesCpu(buildSpawnFlags([9], playfield)))
      .map((i) => cellToRowCol(i).col);
    expect(cols).toEqual([0, 1, 2, 4, 5, 6, 8, 9]);
  });

  it('thins evenly under a reduced particle budget', () => {
    const playfield = Array.from({ length: 20 }, () => fullRow());
    const full = compactIndicesCpu(buildSpawnFlags([10], playfield, { maxParticles: 5000 }));
    const squeezed = compactIndicesCpu(buildSpawnFlags([10], playfield, { maxParticles: 1500 }));
    const starved = compactIndicesCpu(buildSpawnFlags([10], playfield, { maxParticles: 800 }));
    expect(full.length).toBe(10);
    expect(squeezed.length).toBe(5);
    expect(starved.length).toBeLessThan(squeezed.length);
  });

  it('phase-shifts the stride per row so a thinned burst is not a comb', () => {
    const playfield = Array.from({ length: 20 }, () => fullRow());
    const flags = buildSpawnFlags([4, 5], playfield, { maxParticles: 800 });
    const colsOf = (row: number) => Array.from(compactIndicesCpu(flags))
      .filter((i) => cellToRowCol(i).row === row)
      .map((i) => cellToRowCol(i).col);
    expect(colsOf(4)).not.toEqual(colsOf(5));
  });

  it('ignores out-of-range rows', () => {
    expect(compactIndicesCpu(buildSpawnFlags([-1, 20, 99], null)).length).toBe(0);
  });
});

describe('spawnStride', () => {
  it('never thins at or above the full budget', () => {
    expect(spawnStride({ maxParticles: 5000 })).toBe(1);
    expect(spawnStride({})).toBe(1);
  });

  it('steps down with the adaptive budget', () => {
    expect(spawnStride({ maxParticles: 1500 })).toBe(2);
    expect(spawnStride({ maxParticles: 800 })).toBe(3);
  });
});

describe('spawnLookup', () => {
  it('builds a board-sized membership table and drops junk indices', () => {
    const lookup = spawnLookup([0, 5, BOARD_CELLS, -3, BOARD_CELLS - 1]);
    expect(lookup.length).toBe(BOARD_CELLS);
    expect(lookup[0]).toBe(1);
    expect(lookup[5]).toBe(1);
    expect(lookup[BOARD_CELLS - 1]).toBe(1);
    expect(lookup[6]).toBe(0);
  });
});
