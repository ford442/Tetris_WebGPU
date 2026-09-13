import { describe, expect, it } from 'vitest';
import { dilateBinaryMask, maskAlphaHistogram } from '../src/webgpu/blockTextureExtract.js';
import { evalAuthoredOutAlpha, DEFAULT_GLASS_PARAMS, gradeGoldMetalAlbedo } from '../src/webgpu/blockTexture.js';

describe('extractor mask dilate + histogram', () => {
  it('dilates a 1px gold hinge so neighboring glass cannot punch a hole', () => {
    const w = 8;
    const h = 8;
    const src = new Uint8Array(w * h);
    // Vertical hinge at x=0 (left edge of a cube face).
    for (let y = 0; y < h; y++) src[y * w] = 1;
    const dilated = dilateBinaryMask(src, w, h, 1);
    for (let y = 0; y < h; y++) {
      expect(dilated[y * w]).toBe(1);
      expect(dilated[y * w + 1]).toBe(1);
      expect(dilated[y * w + 2]).toBe(0);
    }
  });

  it('reports opaque gold and empty glass with no mid-alpha halo on a binary mask', () => {
    const w = 16;
    const h = 16;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const edge = Math.min(x, w - 1 - x, y, h - 1 - y);
        const metal = edge < 3;
        rgba[i] = metal ? 220 : 80;
        rgba[i + 1] = metal ? 180 : 90;
        rgba[i + 2] = metal ? 40 : 160;
        rgba[i + 3] = metal ? 255 : 0;
      }
    }
    const hist = maskAlphaHistogram(rgba, 4);
    expect(hist.metal + hist.glass).toBe(hist.total);
    expect(hist.halo).toBe(0);
    expect(hist.metal).toBeGreaterThan(hist.glass * 0.15);
    expect(hist.glass).toBeGreaterThan(0);

    const faceOnGlass = evalAuthoredOutAlpha(0, 1, DEFAULT_GLASS_PARAMS);
    const gold = evalAuthoredOutAlpha(1, 0.2, DEFAULT_GLASS_PARAMS);
    expect(faceOnGlass).toBeGreaterThanOrEqual(0.05);
    expect(faceOnGlass).toBeLessThanOrEqual(0.15);
    expect(gold).toBe(1);
  });

  it('grades silver-chrome hinge RGB toward jewelry gold', () => {
    const [r, g, b] = gradeGoldMetalAlbedo(0.67, 0.65, 0.60);
    expect(r - b).toBeGreaterThan(0.35);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('does not dilate when radius is 0', () => {
    const src = new Uint8Array([1, 0, 0, 0]);
    expect(dilateBinaryMask(src, 2, 2, 0)).toBe(src);
  });
});
