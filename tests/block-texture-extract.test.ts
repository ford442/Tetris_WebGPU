import { describe, expect, it } from 'vitest';
import { BLOCK_TILE_EXTRACT_SCALE } from '../src/webgpu/blockTextureExtract.js';
import { DEFAULT_BLOCK_TEXTURE_CONFIG } from '../src/webgpu/blockTexture.js';

describe('block texture extraction', () => {
  it('defines 2× upscale for the middle atlas tile crop', () => {
    expect(BLOCK_TILE_EXTRACT_SCALE).toBe(2);

    const imgW = 2816;
    const imgH = 1536;
    const sw = (DEFAULT_BLOCK_TEXTURE_CONFIG.subregionWidth ?? 1) * imgW;
    const sh = (DEFAULT_BLOCK_TEXTURE_CONFIG.subregionHeight ?? 1) * imgH;
    const inset = DEFAULT_BLOCK_TEXTURE_CONFIG.subregionInset ?? 0;

    const cropW = sw * (1.0 - inset * 2.0);
    const cropH = sh * (1.0 - inset * 2.0);

    expect(Math.round(cropW * BLOCK_TILE_EXTRACT_SCALE)).toBe(1280);
    expect(Math.round(cropH * BLOCK_TILE_EXTRACT_SCALE)).toBe(1261);
  });
});
