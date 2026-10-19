import { describe, it, expect } from 'vitest';
import { evaluateTSpin } from '../src/game/tSpin.js';
import type { Piece } from '../src/game/pieces.js';

describe('T-Spin Rules', () => {
  const createMockPiece = (rotation: number): Piece => ({
    type: 'T',
    rotation,
    x: 1,
    y: 1,
    blocks: [], // blocks aren't used by evaluateTSpin
  });

  const getCellMock = (playfield: number[][]) => (x: number, y: number) => {
    if (y < 0 || y >= playfield.length || x < 0 || x >= playfield[0].length) {
      return 1; // Out of bounds counts as occupied
    }
    return playfield[y][x];
  };

  const corners = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

  it('detects normal T-Spin when both front corners are occupied', () => {
    // Rotation 0 (flat side up): front corners are top-left (0) and top-right (1)
    // T piece is at x: 1, y: 1. Corners are (1,1), (3,1), (1,3), (3,3)
    const playfield = [
      [0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0], // row 1: corner A (1,1) filled, corner B (3,1) filled
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0], // row 3: corner C (1,3) filled, D empty. 3 corners total
      [0, 0, 0, 0, 0]
    ];

    const result = evaluateTSpin(createMockPiece(0), getCellMock(playfield), 5, 5, corners, 0);
    expect(result).toBe('normal');
  });

  it('detects mini T-Spin when 1 front + 2 back corners are occupied', () => {
    // Rotation 0 (flat side up): front corners are top-left (0) and top-right (1)
    // T piece is at x: 1, y: 1. Corners are (1,1), (3,1), (1,3), (3,3)
    const playfield = [
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0], // row 1: corner A (1,1) filled, corner B (3,1) empty
      [0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0], // row 3: corner C (1,3) filled, D (3,3) filled. 3 corners total
      [0, 0, 0, 0, 0]
    ];

    const result = evaluateTSpin(createMockPiece(0), getCellMock(playfield), 5, 5, corners, 0);
    expect(result).toBe('mini');
  });

  it('promotes to normal T-Spin if kick index 4 is used (kick-5 upgrade)', () => {
    const playfield = [
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0], // row 1: corner A (1,1) filled, corner B (3,1) empty
      [0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0], // row 3: corner C (1,3) filled, D (3,3) filled. 3 corners total
      [0, 0, 0, 0, 0]
    ];

    // Kick index 4 (the 5th kick) promotes mini to normal
    const result = evaluateTSpin(createMockPiece(0), getCellMock(playfield), 5, 5, corners, 4);
    expect(result).toBe('normal');
  });

  it('returns none if fewer than 3 corners are occupied', () => {
    const playfield = [
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0], // row 1: corner A (1,1) filled, corner B (3,1) empty
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0], // row 3: corner C (1,3) filled, D empty. 2 corners total
      [0, 0, 0, 0, 0]
    ];

    const result = evaluateTSpin(createMockPiece(0), getCellMock(playfield), 5, 5, corners, 0);
    expect(result).toBe('none');
  });

  it('checks rotation 1 (Right state - B & D are front)', () => {
    // Corners are (1,1), (3,1), (1,3), (3,3)
    // Front: B (3,1) and D (3,3)
    const playfield = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0], // row 1: B (3,1) filled
      [0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0], // row 3: C (1,3) filled, D (3,3) filled
      [0, 0, 0, 0, 0]
    ];
    // 3 corners filled. Front corners: B filled, D filled -> Both front filled
    const result = evaluateTSpin(createMockPiece(1), getCellMock(playfield), 5, 5, corners, 0);
    expect(result).toBe('normal');
  });
});

import { attackRowsFromClear } from '../src/versus/garbage.js';

describe('T-Spin Garbage Rules', () => {
  it('sends correct garbage lines', () => {
    expect(attackRowsFromClear(1, 'mini')).toBe(0);
    expect(attackRowsFromClear(2, 'mini')).toBe(1);
    expect(attackRowsFromClear(1, 'normal')).toBe(2);
    expect(attackRowsFromClear(2, 'normal')).toBe(4);
    expect(attackRowsFromClear(3, 'normal')).toBe(6);
  });
});
