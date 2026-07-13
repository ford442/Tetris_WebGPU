import { describe, it, expect } from 'vitest';
import {
  flattenPlayfieldGrid,
  packPieceState,
  PLAYFIELD_CELL_COUNT,
  PIECE_STATE_BYTES,
} from '../src/viewCpp/cppPlayfieldSync.js';

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

  it('packs piece state with lock flash into 12 bytes', () => {
    const packed = packPieceState({
      activePiece: {
        blocks: [[0, 6, 0], [6, 6, 6], [0, 0, 0]],
        x: 3,
        y: 5,
        rotation: 1,
      },
      isGameOver: false,
      lockTimer: 250,
      lockDelayTime: 500,
    }, 18);

    expect(packed.length).toBe(PIECE_STATE_BYTES);
    expect(packed[0]).toBe(6);
    expect(packed[1]).toBe(1);
    expect(packed[2]).toBe(3);
    expect(packed[3]).toBe(5);
    expect(packed[4]).toBe(18);
    expect(new DataView(packed.buffer).getFloat32(8, true)).toBeCloseTo(0.5, 2);
  });
});
