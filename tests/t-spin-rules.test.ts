import { describe, it, expect } from 'vitest';
import { evaluateTSpin } from '../src/game/tSpin.js';
import type { Piece } from '../src/game/pieces.js';
import { attackRowsFromClear } from '../src/versus/garbage.js';

describe('T-Spin Rules', () => {
  it('detects a normal T-Spin with 3 corners occupied and 2 front corners', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1;
      if (x === 2 && y === 0) return 1;
      if (x === 0 && y === 2) return 1;
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('normal');
  });

  it('detects a mini T-Spin with 3 corners occupied and 1 front corner', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1;
      if (x === 0 && y === 2) return 1;
      if (x === 2 && y === 2) return 1;
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('mini');
  });

  it('promotes to a normal T-Spin when kick index 4 is used', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1;
      if (x === 0 && y === 2) return 1;
      if (x === 2 && y === 2) return 1;
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 4)).toBe('normal');
  });

  it('returns none when fewer than 3 corners are occupied', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => x === 0 && y === 0 ? 1 : 0;
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('none');
  });

  it('treats walls and the floor as occupied corners', () => {
    const piece: Piece = { type: 'T', x: -1, y: 19, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: -1, y: 19 }, { x: 1, y: 19 }, { x: -1, y: 21 }, { x: 1, y: 21 }];
    expect(evaluateTSpin(piece, () => 0, 10, 20, corners, 0)).toBe('mini');
  });

  it('maps front corners across all 4 orientations', () => {
    const getCell = () => 1;
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    for (let rotation = 0; rotation < 4; rotation++) {
      const piece: Piece = { type: 'T', x: 0, y: 0, rotation, blocks: [], color: 0 };
      expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('normal');
    }
  });
});

describe('T-Spin Garbage Rules', () => {
  it('sends the correct number of garbage lines', () => {
    expect(attackRowsFromClear(1, 'mini')).toBe(0);
    expect(attackRowsFromClear(2, 'mini')).toBe(1);
    expect(attackRowsFromClear(1, 'normal')).toBe(2);
    expect(attackRowsFromClear(2, 'normal')).toBe(4);
    expect(attackRowsFromClear(3, 'normal')).toBe(6);
  });
});
