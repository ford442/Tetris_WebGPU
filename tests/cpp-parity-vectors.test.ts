/**
 * shared/cppParityVectors.json holds literal numbers that BOTH renderers are held to.
 * This file checks the TypeScript side; cpp/tests/*.cpp (npm run cpp:test:native) checks
 * cpp/src/*.h against the same file via the generated cpp/tests/generated/parity_vectors.h.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mat4 } from 'gl-matrix';

import { CAMERA_CONFIG } from '../src/config/renderConfig.js';
import {
  BLOCK_TEXTURE_MAX_LOD,
  createBlockTextureColorSamplerDescriptor,
  createBlockTextureMaskSamplerDescriptor,
} from '../src/webgpu/blockTexture.js';
import {
  BLOCK_HALF_WORLD_SIZE,
  BLOCK_WORLD_SIZE,
  BOARD_COLUMNS,
  BOARD_ROWS,
  BOARD_WORLD_CENTER_X,
  BOARD_WORLD_CENTER_Y,
  boardWorldX,
  boardWorldY,
} from '../src/webgpu/renderMetrics.js';
import { PIECE_STATE_BYTES, PLAYFIELD_CELL_COUNT, packPieceState } from '../src/viewCpp/cppPlayfieldSync.js';

const ROOT = join(__dirname, '..');
const V = JSON.parse(readFileSync(join(ROOT, 'shared/cppParityVectors.json'), 'utf8'));
const TOL: number = V.tolerance;
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOL);

describe('board metrics (TS side of the shared vectors)', () => {
  it('dimensions, block size and center', () => {
    expect(BOARD_COLUMNS).toBe(V.board.cols);
    expect(BOARD_ROWS).toBe(V.board.rows);
    expect(PLAYFIELD_CELL_COUNT).toBe(V.board.playfieldBytes);
    near(BLOCK_WORLD_SIZE, V.board.blockWorldSize);
    near(BOARD_WORLD_CENTER_X, V.board.centerX);
    near(BOARD_WORLD_CENTER_Y, V.board.centerY);
  });

  it.each(V.board.worldX as Array<[number, number]>)('boardWorldX(%i) = %f', (col, expected) => {
    near(boardWorldX(col), expected);
  });

  it.each(V.board.worldY as Array<[number, number]>)('boardWorldY(%i) = %f', (row, expected) => {
    near(boardWorldY(row), expected);
  });

  it.each(V.board.blockCenterX as Array<[number, number]>)('block center x(%i) = %f', (col, expected) => {
    near(boardWorldX(col) + BLOCK_HALF_WORLD_SIZE, expected);
  });

  it.each(V.board.blockCenterY as Array<[number, number]>)('block center y(%i) = %f', (row, expected) => {
    near(boardWorldY(row) - BLOCK_HALF_WORLD_SIZE, expected);
  });

  it('camera', () => {
    expect(CAMERA_CONFIG.DEFAULT_Z).toBe(V.camera.z);
    expect(CAMERA_CONFIG.FOV_DEGREES).toBe(V.camera.fovDeg);
    expect(CAMERA_CONFIG.NEAR_PLANE).toBe(V.camera.near);
    expect(CAMERA_CONFIG.FAR_PLANE).toBe(V.camera.far);
  });
});

describe('piece-state layout', () => {
  it('size matches', () => {
    expect(PIECE_STATE_BYTES).toBe(V.pieceState.sizeBytes);
  });

  it('packPieceState writes each field at the vector offset', () => {
    const o = V.pieceState.offsets;
    const packed = packPieceState(
      {
        activePiece: { blocks: [[0, 3], [0, 0]], x: 4, y: 5, rotation: 2 },
        lockTimer: 250,
        lockDelayTime: 500,
      },
      18,
    );
    expect(packed.length).toBe(V.pieceState.sizeBytes);
    expect(packed[o.pieceType]).toBe(3);
    expect(packed[o.rotation]).toBe(2);
    expect(packed[o.x]).toBe(4);
    expect(packed[o.y]).toBe(5);
    expect(packed[o.ghostY]).toBe(18);
    expect(new DataView(packed.buffer).getFloat32(o.lockFlash, true)).toBeCloseTo(0.5, 6);
  });
});

describe('block samplers', () => {
  it('color sampler (full mip chain) matches', () => {
    const d = createBlockTextureColorSamplerDescriptor();
    const c = V.sampler.color;
    expect(BLOCK_TEXTURE_MAX_LOD).toBe(V.sampler.maxLod);
    expect(d.magFilter).toBe(c.magFilter);
    expect(d.minFilter).toBe(c.minFilter);
    expect(d.mipmapFilter).toBe(c.mipmapFilter);
    expect(d.addressModeU).toBe(c.addressMode);
    expect(d.addressModeV).toBe(c.addressMode);
    expect(d.lodMinClamp).toBe(c.lodMinClamp);
    expect(d.lodMaxClamp).toBe(V.sampler.maxLod);
    expect(d.maxAnisotropy).toBe(V.sampler.maxAnisotropy);
  });

  it('mask sampler matches', () => {
    const d = createBlockTextureMaskSamplerDescriptor();
    const m = V.sampler.mask;
    expect(d.magFilter).toBe(m.magFilter);
    expect(d.minFilter).toBe(m.minFilter);
    expect(d.mipmapFilter).toBe(m.mipmapFilter);
    expect(d.addressModeU).toBe(m.addressMode);
    expect(d.addressModeV).toBe(m.addressMode);
    expect(d.lodMinClamp).toBe(m.lodMinClamp);
    expect(d.lodMaxClamp).toBe(m.lodMaxClamp);
  });

  it('the per-mip-level cases are consistent with the TS full-chain sampler', () => {
    // C++ receives a single mip level today, so it derives clamps from the real level
    // count; with a chain at least maxLod+1 deep it must equal the TS sampler exactly.
    for (const c of V.sampler.colorByMipLevels) {
      expect(c.lodMaxClamp).toBe(Math.min(Math.max(c.levels, 1) - 1, V.sampler.maxLod));
      expect(c.viewMipLevels).toBe(Math.min(Math.max(c.levels, 1), V.sampler.maxLod + 1));
      expect(c.maxAnisotropy).toBe(c.levels > 1 ? V.sampler.maxAnisotropy : 1);
      if (c.levels > V.sampler.maxLod) expect(c.lodMaxClamp).toBe(createBlockTextureColorSamplerDescriptor().lodMaxClamp);
    }
  });
});

describe('mat4 helpers match gl-matrix', () => {
  const closeAll = (actual: ArrayLike<number>, expected: number[]) => {
    expect(actual.length).toBe(expected.length);
    expected.forEach((e, i) => near(actual[i], e));
  };

  it('perspective (zero-to-one depth)', () => {
    const p = V.mat4.perspective;
    closeAll(mat4.perspectiveZO(mat4.create(), (p.fovYDeg * Math.PI) / 180, p.aspect, p.near, p.far), p.expected);
  });

  it('lookAt', () => {
    for (const c of V.mat4.lookAt) {
      closeAll(mat4.lookAt(mat4.create(), c.eye, c.target, c.up), c.expected);
    }
  });

  it('projection * view', () => {
    const p = V.mat4.perspective;
    const proj = mat4.perspectiveZO(mat4.create(), (p.fovYDeg * Math.PI) / 180, p.aspect, p.near, p.far);
    const l = V.mat4.lookAt[1];
    const view = mat4.lookAt(mat4.create(), l.eye, l.target, l.up);
    closeAll(mat4.multiply(mat4.create(), proj, view), V.mat4.multiply.expected);
  });
});

describe('generated C++ header', () => {
  it('is emitted from the same JSON (spot-check literals)', () => {
    execFileSync(process.execPath, [join(ROOT, 'scripts/generate-cpp-test-vectors.mjs')], { cwd: ROOT, stdio: 'pipe' });
    const header = readFileSync(join(ROOT, 'cpp/tests/generated/parity_vectors.h'), 'utf8');
    expect(header).toContain(`constexpr double kBlockWorldSize = ${V.board.blockWorldSize};`);
    expect(header).toContain(`constexpr int kPieceStateSize = ${V.pieceState.sizeBytes};`);
    expect(header).toContain(`constexpr uint32_t kSamplerMaxLod = ${V.sampler.maxLod};`);
    expect(header).toContain(`constexpr double kCameraZ = ${V.camera.z.toFixed(1)};`);
  });
});
