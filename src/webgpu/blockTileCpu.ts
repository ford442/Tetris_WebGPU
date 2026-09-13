/**
 * Canvas-free tile extraction — the CPU twin of `extractBlockTileFromImage`.
 *
 * Exists so the visual contract has a gate that runs in `npm test`: decode
 * public/block.png, crop + resample the authored tile, bake the metal mask and the
 * packed material map, then measure the result against block-material.json. No
 * browser, no GPU, no screenshot diffing — which matters because headless WebGPU is
 * not dependable enough to be the only thing standing between a bad `block-*.png`
 * and production.
 *
 * The resample is a plain bilinear filter rather than a reimplementation of the
 * browser's `imageSmoothingQuality: 'high'`. The contract is measured as *means over
 * regions* (border ring, centre disc), which are insensitive to that difference; the
 * mask bake itself is the same code the browser runs (blockMaskBake.ts).
 */

import type { BlockTextureConfig } from './blockTexture.js';
import { getBlockTextureConfig } from './blockTexture.js';
import { bakeMetalMaskAlpha } from './blockMaskBake.js';

export interface CpuImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface CpuExtractedTile {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
}

/** The crop rect `extractBlockTileFromImage` uses, as plain numbers. */
export function tileCropRect(
  imgW: number,
  imgH: number,
  config: BlockTextureConfig,
): { x: number; y: number; width: number; height: number } {
  const sx = (config.subregionX ?? 0) * imgW;
  const sy = (config.subregionY ?? 0) * imgH;
  const sw = (config.subregionWidth ?? 1) * imgW;
  const sh = (config.subregionHeight ?? 1) * imgH;
  const inset = config.subregionInset ?? 0;
  return {
    x: sx + sw * inset,
    y: sy + sh * inset,
    width: sw * (1.0 - inset * 2.0),
    height: sh * (1.0 - inset * 2.0),
  };
}

/** Bilinear resample of a sub-rect of an RGBA image into `outW`x`outH`. */
export function resampleRgba(
  src: CpuImage,
  rect: { x: number; y: number; width: number; height: number },
  outW: number,
  outH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width: sw, height: sh } = src;

  for (let y = 0; y < outH; y++) {
    const fy = rect.y + ((y + 0.5) / outH) * rect.height - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(sh - 1, y0 + 1));
    const wy = fy - Math.floor(fy);

    for (let x = 0; x < outW; x++) {
      const fx = rect.x + ((x + 0.5) / outW) * rect.width - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.max(0, Math.min(sw - 1, x0 + 1));
      const wx = fx - Math.floor(fx);

      const o = (y * outW + x) * 4;
      const i00 = (y0 * sw + x0) * 4;
      const i01 = (y0 * sw + x1) * 4;
      const i10 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c] * (1 - wx) + data[i01 + c] * wx;
        const bottom = data[i10 + c] * (1 - wx) + data[i11 + c] * wx;
        out[o + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
    }
  }
  return out;
}

/**
 * Crop + upscale the authored tile and bake the metal mask into its alpha — the
 * same sequence `extractBlockTileFromImage` performs, minus the canvas.
 */
export function extractBlockTileCpu(
  image: CpuImage,
  scale = 2.0,
  config: BlockTextureConfig = getBlockTextureConfig(),
  mask?: CpuImage | null,
): CpuExtractedTile {
  const rect = tileCropRect(image.width, image.height, config);
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));

  const data = resampleRgba(image, rect, width, height);
  const maskData = mask
    ? resampleRgba(mask, tileCropRect(mask.width, mask.height, config), width, height)
    : null;

  bakeMetalMaskAlpha(data, width, height, config, maskData);

  return {
    data,
    width,
    height,
    sourceWidth: rect.width,
    sourceHeight: rect.height,
    scale,
  };
}
