import { describe, expect, it } from 'vitest';
import {
  decodeRGBM,
  encodeRGBM,
  octDecode,
  octEncode,
  pixelRoughnessFromMetalMask,
  sampleStudioRadiance,
} from '../src/webgpu/ibl/iblMath.js';
import { shouldEnableHdrPlayfield, shouldEnableIbl } from '../src/webgpu/ibl/iblResources.js';
import { adaptiveDisablesIbl } from '../src/webgpu/adaptiveQuality.js';
import { DESIRED_OPTIONAL_FEATURES } from '../src/webgpu/gpuContext.js';
import { Materials } from '../src/webgpu/materials.js';

describe('octahedral mapping', () => {
  it('round-trips unit directions', () => {
    const dirs: Array<[number, number, number]> = [
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0.28, 0.62, 0.72],
    ];
    for (const [x, y, z] of dirs) {
      const len = Math.hypot(x, y, z);
      const n: [number, number, number] = [x / len, y / len, z / len];
      const [u, v] = octEncode(n[0], n[1], n[2]);
      const back = octDecode(u, v);
      expect(back[0]).toBeCloseTo(n[0], 5);
      expect(back[1]).toBeCloseTo(n[1], 5);
      expect(back[2]).toBeCloseTo(n[2], 5);
    }
  });
});

describe('RGBM', () => {
  it('round-trips warm studio highlights within encoding range', () => {
    const [r, g, b] = sampleStudioRadiance(0.28, 0.62, 0.72);
    const enc = encodeRGBM(r, g, b);
    const dec = decodeRGBM(enc[0], enc[1], enc[2], enc[3]);
    expect(dec[0]).toBeGreaterThan(1);
    expect(dec[1]).toBeGreaterThan(dec[2]);
    expect(Math.abs(dec[0] - r)).toBeLessThan(0.08);
  });
});

describe('authored metal roughness', () => {
  it('keeps gold hinges glossy and inner filigree slightly rougher', () => {
    expect(pixelRoughnessFromMetalMask(1)).toBeCloseTo(0.12, 5);
    expect(pixelRoughnessFromMetalMask(0)).toBeCloseTo(0.35, 5);
    expect(Materials.imageSampled.metallic).toBeGreaterThan(0.3);
    expect(Materials.imageSampled.roughness).toBeLessThan(0.2);
    expect(Materials.imageSampled.clearcoat).toBeCloseTo(0.3, 5);
  });
});

describe('IBL / HDR feature gates', () => {
  it('disables cubemap IBL on low-power GPU, low quality, and adaptive steps', () => {
    expect(shouldEnableIbl({ powerPreference: 'low-power' })).toBe(false);
    expect(shouldEnableIbl({ quality: 'low' })).toBe(false);
    expect(shouldEnableIbl({ adaptiveDisableIbl: true })).toBe(false);
    expect(shouldEnableIbl({ powerPreference: 'high-performance', quality: 'high' })).toBe(true);
    expect(adaptiveDisablesIbl(0)).toBe(false);
    expect(adaptiveDisablesIbl(2)).toBe(true);
  });

  it('requests HDR renderable formats and skips HDR playfield on low power', () => {
    expect(DESIRED_OPTIONAL_FEATURES).toContain('rg11b10ufloat-renderable');
    expect(DESIRED_OPTIONAL_FEATURES).toContain('float32-filterable');
    expect(shouldEnableHdrPlayfield({ powerPreference: 'low-power' })).toBe(false);
    expect(shouldEnableHdrPlayfield({ quality: 'high' })).toBe(true);
  });
});
