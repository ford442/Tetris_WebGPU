/**
 * The visual contract, measured on CPU against the real authored asset.
 *
 * This is the gate the task calls for: headless WebGPU is not dependable enough to
 * make a screenshot diff the only thing protecting the go.1ink.us look, so instead
 * the *inputs to the shader* are asserted — decode public/block.png, run the real
 * extractor and bakers, and check the gold frame / crystal well / roughness band
 * against the thresholds in public/block-material.json.
 *
 * A new block-*.png that breaks the look fails here, with a number saying why.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readPng } from '../scripts/lib/png.mjs';
import {
  DEFAULT_AUTHORED_BLOCK_MATERIAL,
  mergeAuthoredBlockMaterial,
  validateAuthoredBlockMaterial,
} from '../src/webgpu/blockMaterial.js';
import {
  bakeMaterialMapRgba,
  checkBlockMaterialContract,
  maskIoU,
  measureBlockMaterialContract,
} from '../src/webgpu/blockMaterialMaps.js';
import { extractBlockTileCpu } from '../src/webgpu/blockTileCpu.js';
import {
  DEFAULT_BLOCK_TEXTURE_CONFIG,
  SINGLE_TILE_TEXTURE_CONFIG,
} from '../src/webgpu/blockTexture.js';

const ROOT = process.cwd();

function authoredMaterial() {
  const json: unknown = JSON.parse(
    readFileSync(join(ROOT, 'public/block-material.json'), 'utf8'),
  );
  const { ok, errors } = validateAuthoredBlockMaterial(json);
  expect(ok, errors.join('\n')).toBe(true);
  return mergeAuthoredBlockMaterial(json);
}

/** block.png decoded once — it is 2816x1536, so decoding is not free. */
function blockPng() {
  const png = readPng(join(ROOT, 'public/block.png'));
  return { data: png.data, width: png.width, height: png.height };
}

describe('authored block material contract', () => {
  const material = authoredMaterial();

  it('public/block-material.json matches the TS reference material', () => {
    // If these drift, the C++ renderer (generated from the JSON) and the TS
    // fallback (this object) would render two different bricks.
    expect(mergeAuthoredBlockMaterial(
      JSON.parse(readFileSync(join(ROOT, 'public/block-material.json'), 'utf8')),
    )).toEqual(DEFAULT_AUTHORED_BLOCK_MATERIAL);
  });

  it('keeps a gold frame and a transmissive crystal well on the real tile', () => {
    const tile = extractBlockTileCpu(blockPng(), 2.0, DEFAULT_BLOCK_TEXTURE_CONFIG);
    const map = bakeMaterialMapRgba(tile.data, tile.width, tile.height, material);
    const check = checkBlockMaterialContract(
      measureBlockMaterialContract(tile.data, tile.width, tile.height, map.rgba),
      material,
    );
    expect(check.failures.join(' | ')).toBe('');
    expect(check.ok).toBe(true);
  });

  it('bakes the crystal smoother than the gold frame', () => {
    const tile = extractBlockTileCpu(blockPng(), 2.0, DEFAULT_BLOCK_TEXTURE_CONFIG);
    const map = bakeMaterialMapRgba(tile.data, tile.width, tile.height, material);
    const metrics = measureBlockMaterialContract(tile.data, tile.width, tile.height, map.rgba);

    // Transmission needs a near-polished interior; jewelry gold is worked metal.
    // +1/255: roughness is stored as a byte, so 0.05 bakes to 13/255 = 0.0510.
    const quantum = 1 / 255;
    expect(metrics.glassRoughnessMean).toBeLessThanOrEqual(material.roughness.glass + quantum);
    expect(metrics.metalRoughnessMean).toBeGreaterThan(metrics.glassRoughnessMean);
    expect(metrics.metalRoughnessMean).toBeLessThanOrEqual(material.roughness.metal + quantum);
  });

  it('segments the tile the same way at 1x and 2x extraction (mask IoU)', () => {
    // A tuning change that moves the frame boundary shows up as a low IoU even when
    // the border/centre means still pass.
    const png = blockPng();
    const a = extractBlockTileCpu(png, 1.0, DEFAULT_BLOCK_TEXTURE_CONFIG);
    const b = extractBlockTileCpu(png, 2.0, DEFAULT_BLOCK_TEXTURE_CONFIG);

    // Compare at the coarser resolution by sampling b at a's grid.
    const resampled = new Uint8ClampedArray(a.width * a.height * 4);
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const sx = Math.min(b.width - 1, Math.round((x / Math.max(1, a.width - 1)) * (b.width - 1)));
        const sy = Math.min(b.height - 1, Math.round((y / Math.max(1, a.height - 1)) * (b.height - 1)));
        resampled[(y * a.width + x) * 4 + 3] = b.data[(sy * b.width + sx) * 4 + 3];
      }
    }
    expect(maskIoU(a.data, resampled)).toBeGreaterThan(0.9);
  });

  it('fails loudly when the authored tile loses its gold frame', () => {
    // Simulated regression: a tile whose border is crystal, not metal.
    const width = 64;
    const height = 64;
    const flat = new Uint8ClampedArray(width * height * 4).fill(200);
    for (let i = 0; i < width * height; i++) flat[i * 4 + 3] = 0;
    const check = checkBlockMaterialContract(
      measureBlockMaterialContract(flat, width, height),
      material,
    );
    expect(check.ok).toBe(false);
    expect(check.failures.join(' ')).toMatch(/gold frame too thin/);
  });

  it('fails loudly when the crystal well fills in with metal', () => {
    const width = 64;
    const height = 64;
    const solid = new Uint8ClampedArray(width * height * 4).fill(255);
    const check = checkBlockMaterialContract(
      measureBlockMaterialContract(solid, width, height),
      material,
    );
    expect(check.ok).toBe(false);
    expect(check.failures.join(' ')).toMatch(/crystal well not transmissive/);
  });

  it('extracts the single-tile layout without a subregion crop', () => {
    // go.1ink.us ships a 768x768 single tile; the CPU extractor must honour the same
    // config switch the browser path does rather than cropping a corner sliver.
    const size = 128;
    const single = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      single[i * 4 + 0] = 220;
      single[i * 4 + 1] = 170;
      single[i * 4 + 2] = 60;
      single[i * 4 + 3] = 255;
    }
    const tile = extractBlockTileCpu({ data: single, width: size, height: size }, 1.0, {
      ...SINGLE_TILE_TEXTURE_CONFIG,
      subregionX: 0,
      subregionY: 0,
      subregionWidth: 1,
      subregionHeight: 1,
      subregionInset: 0,
    });
    expect(tile.width).toBe(size);
    expect(tile.height).toBe(size);
  });
});
