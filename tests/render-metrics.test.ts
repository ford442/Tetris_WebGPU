import { describe, it, expect } from 'vitest';
import {
  BLOCK_WORLD_SIZE,
  BOARD_WORLD_CENTER_X,
  BOARD_WORLD_CENTER_Y,
  boardWorldX,
  boardWorldY,
  borderWorldX,
  borderWorldY,
} from '../src/webgpu/renderMetrics.js';

describe('render metrics', () => {
  it('keeps the board and border centered on the same world origin', () => {
    expect((boardWorldX(0) + boardWorldX(9)) / 2).toBeCloseTo(
      BOARD_WORLD_CENTER_X,
      5
    );
    expect((boardWorldY(0) + boardWorldY(19)) / 2).toBeCloseTo(
      BOARD_WORLD_CENTER_Y,
      5
    );
    expect((borderWorldX(0) + borderWorldX(11)) / 2).toBeCloseTo(
      BOARD_WORLD_CENTER_X,
      5
    );
    expect((borderWorldY(0) + borderWorldY(21)) / 2).toBeCloseTo(
      BOARD_WORLD_CENTER_Y,
      5
    );
  });

  it('places the border exactly one block around the playfield', () => {
    expect(borderWorldX(0)).toBeCloseTo(boardWorldX(0) - BLOCK_WORLD_SIZE, 5);
    expect(borderWorldX(11)).toBeCloseTo(boardWorldX(9) + BLOCK_WORLD_SIZE, 5);
    expect(borderWorldY(0)).toBeCloseTo(boardWorldY(0) + BLOCK_WORLD_SIZE, 5);
    expect(borderWorldY(21)).toBeCloseTo(boardWorldY(19) - BLOCK_WORLD_SIZE, 5);
  });
});
