import { describe, it, expect } from 'vitest';
import { flattenPlayfieldGrid, PLAYFIELD_CELL_COUNT } from '../src/viewCpp/cppPlayfieldSync.js';

describe('flattenPlayfieldGrid', () => {
  it('returns 200 zero bytes for empty input', () => {
    const flat = flattenPlayfieldGrid(undefined);
    expect(flat.length).toBe(PLAYFIELD_CELL_COUNT);
    expect(flat.every((v) => v === 0)).toBe(true);
  });

  it('preserves locked blocks and active piece indices', () => {
    const grid = Array.from({ length: 20 }, () => Array(10).fill(0));
    grid[19][4] = 3;
    grid[18][5] = 5;
    grid[17][6] = 1;

    const flat = flattenPlayfieldGrid(grid);
    expect(flat[19 * 10 + 4]).toBe(3);
    expect(flat[18 * 10 + 5]).toBe(5);
    expect(flat[17 * 10 + 6]).toBe(1);
  });

  it('preserves signed ghost piece cells', () => {
    const grid = Array.from({ length: 20 }, () => Array(10).fill(0));
    grid[10][3] = -6;
    grid[11][3] = -6;
    grid[10][4] = 6;

    const flat = flattenPlayfieldGrid(grid);
    expect(flat[10 * 10 + 3]).toBe(-6);
    expect(flat[11 * 10 + 3]).toBe(-6);
    expect(flat[10 * 10 + 4]).toBe(6);
  });
});
