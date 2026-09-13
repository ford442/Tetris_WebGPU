/**
 * Unit tests for the packed-map bakers. These are the functions that turn an
 * authored tile into the channels every renderer samples, so their channel layout is
 * part of the contract: a silent swap of roughness and metallic would make gold look
 * like plastic in all three renderers at once.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTHORED_BLOCK_MATERIAL,
  mergeAuthoredBlockMaterial,
} from '../src/webgpu/blockMaterial.js';
import {
  bakeMaterialMapRgba,
  bakeRoughnessValue,
  detailFieldFromHeight,
  flatMaterialMapPixel,
  heightFieldFromAlbedo,
  maskIoU,
  measureBlockMaterialContract,
  normalMapPreview,
  packedMetalRoughnessPreview,
} from '../src/webgpu/blockMaterialMaps.js';

/** Gold ring around a darker crystal centre, metal mask baked into alpha. */
function syntheticTile(size = 32, ringFraction = 0.2) {
  const data = new Uint8ClampedArray(size * size * 4);
  const den = Math.max(1, size - 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / den;
      const v = y / den;
      const distEdge = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
      const metal = distEdge < ringFraction;
      const o = (y * size + x) * 4;
      // Gold ring carries high-frequency detail; crystal is smooth. Stripes rather
      // than a checkerboard: a perfect checkerboard has a zero Sobel response.
      const jitter = metal && x % 4 < 2 ? 40 : 0;
      data[o + 0] = metal ? 210 + jitter * 0.2 : 120;
      data[o + 1] = metal ? 160 + jitter * 0.2 : 150;
      data[o + 2] = metal ? 60 : 190;
      data[o + 3] = metal ? 255 : 0;
    }
  }
  return { data, size };
}

describe('packed material map bake', () => {
  const material = DEFAULT_AUTHORED_BLOCK_MATERIAL;

  it('packs normal.xy / roughness / metallic into RGBA', () => {
    const { data, size } = syntheticTile();
    const map = bakeMaterialMapRgba(data, size, size, material);

    expect(map.width).toBe(size);
    expect(map.height).toBe(size);
    expect(map.rgba.length).toBe(size * size * 4);

    // Alpha mirrors the metal mask the albedo carries.
    for (let i = 0; i < size * size; i++) {
      expect(map.rgba[i * 4 + 3]).toBe(data[i * 4 + 3]);
    }
  });

  it('keeps the crystal in the near-polished 0.02-0.08 band', () => {
    const { data, size } = syntheticTile();
    const map = bakeMaterialMapRgba(data, size, size, material);
    const metrics = measureBlockMaterialContract(data, size, size, map.rgba);

    expect(metrics.glassRoughnessMean).toBeGreaterThanOrEqual(0.02);
    expect(metrics.glassRoughnessMean).toBeLessThanOrEqual(0.08);
  });

  it('treats high-frequency gold detail as polish, not as grit', () => {
    // The whole point of baking roughness instead of hardcoding it: burnished hinge
    // detail should tighten the highlight, so detail must *lower* roughness.
    const smooth = bakeRoughnessValue(1, 0, material);
    const detailed = bakeRoughnessValue(1, 1, material);
    expect(detailed).toBeLessThan(smooth);
    expect(detailed).toBeGreaterThanOrEqual(0.04);
  });

  it('clamps an absurd authored roughness instead of producing a mirror', () => {
    const wild = mergeAuthoredBlockMaterial({ roughness: { metal: 1, glass: 1, detail: 1 } });
    expect(bakeRoughnessValue(0, 0, wild)).toBeLessThanOrEqual(0.08);
    expect(bakeRoughnessValue(1, 1, wild)).toBeGreaterThanOrEqual(0.04);
  });

  it('flattens the crystal interior in the height field', () => {
    const { data, size } = syntheticTile();
    const heights = heightFieldFromAlbedo(data, size, size);
    const detail = detailFieldFromHeight(heights, size, size);

    const half = Math.floor(size / 2);
    const centre = half * size + half;           // crystal, smooth by construction
    const ring = half * size + 2;                // gold ring, carries the jitter
    // Crystal luma is weighted down (0.30 + 0.70 * metal), so the crystal contributes
    // no bumps even when the tile itself is noisy there.
    expect(detail[centre]).toBe(0);
    expect(detail[ring]).toBeGreaterThan(0);
  });

  it('emits flat normals where the tile is flat', () => {
    const size = 8;
    const flat = new Uint8ClampedArray(size * size * 4).fill(128);
    for (let i = 0; i < size * size; i++) flat[i * 4 + 3] = 255;
    const map = bakeMaterialMapRgba(flat, size, size, material);
    const centre = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
    expect(map.rgba[centre + 0]).toBeCloseTo(128, 0);
    expect(map.rgba[centre + 1]).toBeCloseTo(128, 0);
  });

  it('previews reconstruct z the way the shader does', () => {
    const { data, size } = syntheticTile();
    const map = bakeMaterialMapRgba(data, size, size, material);
    const normal = normalMapPreview(map);
    for (let i = 0; i < size * size; i++) {
      const nx = (normal[i * 4 + 0] / 255) * 2 - 1;
      const ny = (normal[i * 4 + 1] / 255) * 2 - 1;
      const nz = (normal[i * 4 + 2] / 255) * 2 - 1;
      expect(nx * nx + ny * ny + nz * nz).toBeGreaterThan(0.9);
      expect(normal[i * 4 + 3]).toBe(255);
    }
  });

  it('exports metallic in R and roughness in G for authoring tools', () => {
    const { data, size } = syntheticTile();
    const map = bakeMaterialMapRgba(data, size, size, material);
    const mr = packedMetalRoughnessPreview(map);
    for (let i = 0; i < size * size; i++) {
      expect(mr[i * 4 + 0]).toBe(map.rgba[i * 4 + 3]);
      expect(mr[i * 4 + 1]).toBe(map.rgba[i * 4 + 2]);
    }
  });

  it('1x1 fallback is a flat normal at the authored metal roughness', () => {
    const pixel = flatMaterialMapPixel(material);
    expect([...pixel.slice(0, 2)]).toEqual([128, 128]);
    expect(pixel[2]).toBe(Math.round(material.roughness.metal * 255));
    expect(pixel[3]).toBe(255);
  });

  it('maskIoU is 1 for identical masks and 0 for disjoint ones', () => {
    const a = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const b = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const c = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]);
    expect(maskIoU(a, b)).toBe(1);
    expect(maskIoU(a, c)).toBe(0);
  });
});
