import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCK_WORLD_SIZE,
  BOARD_COLUMNS,
  BOARD_ROWS,
  BOARD_WORLD_CENTER_X,
  BOARD_WORLD_CENTER_Y,
  boardWorldX,
  boardWorldY,
  borderWorldX,
  borderWorldY,
} from '../src/webgpu/renderMetrics.js';
import { CAMERA_CONFIG } from '../src/config/renderConfig.js';

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

/** Parses `constexpr float|int NAME = VALUE[f];` literals out of board_metrics.h. */
function parseCppConstants(source: string): Record<string, number> {
  const values: Record<string, number> = {};
  const re = /constexpr\s+(?:float|int)\s+(\w+)\s*=\s*([\d.]+)f?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    values[m[1]] = Number(m[2]);
  }
  return values;
}

describe('cpp/src/board_metrics.h parity with renderMetrics.ts', () => {
  const cpp = parseCppConstants(
    readFileSync(join(process.cwd(), 'cpp/src/board_metrics.h'), 'utf8'),
  );

  it('board dimensions and block size match', () => {
    expect(cpp.kBoardCols).toBe(BOARD_COLUMNS);
    expect(cpp.kBoardRows).toBe(BOARD_ROWS);
    expect(cpp.kBlockWorldSize).toBeCloseTo(BLOCK_WORLD_SIZE, 5);
  });

  it('camera constants match', () => {
    expect(cpp.kCameraZ).toBeCloseTo(CAMERA_CONFIG.DEFAULT_Z, 5);
    expect(cpp.kCameraFovDeg).toBeCloseTo(CAMERA_CONFIG.FOV_DEGREES, 5);
    expect(cpp.kCameraNear).toBeCloseTo(CAMERA_CONFIG.NEAR_PLANE, 5);
    expect(cpp.kCameraFar).toBeCloseTo(CAMERA_CONFIG.FAR_PLANE, 5);
  });

  it('derived board-center formula (computed independently in board_metrics.h) agrees with renderMetrics.ts', () => {
    const cppCenterX = ((BOARD_COLUMNS - 1) * cpp.kBlockWorldSize) * 0.5;
    const cppCenterY = -((BOARD_ROWS - 1) * cpp.kBlockWorldSize) * 0.5;
    expect(cppCenterX).toBeCloseTo(BOARD_WORLD_CENTER_X, 5);
    expect(cppCenterY).toBeCloseTo(BOARD_WORLD_CENTER_Y, 5);
  });
});
