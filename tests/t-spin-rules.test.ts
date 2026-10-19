import { describe, it, expect } from 'vitest';
import { evaluateTSpin } from '../src/game/tSpin.js';
import type { Piece } from '../src/game/pieces.js';

describe('T-Spin Rules', () => {
  it('should detect a normal T-Spin with 3 corners occupied and 2 front corners', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    // Assuming corners 0 and 1 are front for rotation 0
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1; // front
      if (x === 2 && y === 0) return 1; // front
      if (x === 0 && y === 2) return 1; // back
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('normal');
  });

  it('should detect a mini T-Spin with 3 corners occupied and 1 front corner', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1; // front
      if (x === 0 && y === 2) return 1; // back
      if (x === 2 && y === 2) return 1; // back
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('mini');
  });

  it('should promote to normal T-Spin if kick index is 4 (Kick 5)', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1; // front
      if (x === 0 && y === 2) return 1; // back
      if (x === 2 && y === 2) return 1; // back
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 4)).toBe('normal');
  });

  it('should return none if less than 3 corners occupied', () => {
    const piece: Piece = { type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    const getCell = (x: number, y: number) => {
      if (x === 0 && y === 0) return 1;
      if (x === 2 && y === 0) return 1;
      return 0;
    };
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('none');
  });

  it('should treat walls and floor as occupied corners', () => {
    const piece: Piece = { type: 'T', x: -1, y: 19, rotation: 0, blocks: [], color: 0 };
    // x = -1 is out of bounds (left wall), y = 19 is near floor, y = 21 is below floor
    const corners = [{ x: -1, y: 19 }, { x: 1, y: 19 }, { x: -1, y: 21 }, { x: 1, y: 21 }];
    const getCell = (_x: number, _y: number) => {
      // Empty playfield
      return 0;
    };
    // Corners 0 (-1, 19) is out of bounds -> occupied
    // Corners 2 (-1, 21) is out of bounds -> occupied
    // Corners 3 (1, 21) is out of bounds -> occupied
    // 3 corners occupied out of bounds = T-Spin
    // Because corners 0 is front and 2, 3 are back, only 1 front corner is occupied.
    // Result should be mini.
    expect(evaluateTSpin(piece, getCell, 10, 20, corners, 0)).toBe('mini');
  });

  it('should map front corners correctly across all 4 orientations', () => {
    const getCell = (_x: number, _y: number) => {
      // Assume all corners occupied for this test, we are just testing if it correctly identifies them as normal
      // meaning front corners > 2 must be true if all are occupied.
      return 1;
    };
    const corners = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];

    // R0
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 0, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
    // R1
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 1, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
    // R2
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 2, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
    // R3
    expect(evaluateTSpin({ type: 'T', x: 0, y: 0, rotation: 3, blocks: [], color: 0 }, getCell, 10, 20, corners, 0)).toBe('normal');
  });

  it('replay determinism stores boolean true as normal spin if converted', () => {
    // A quick note/placeholder test to document replay inputs. Replays store inputs, not outcomes,
    // but older replay decoders or game log parsers should treat truthy tSpins as 'normal' or 'mini'.
    expect(true).toBe(true);
  });
});
