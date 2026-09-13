/**
 * Browser glue for the pure bakers in `blockMaterialMaps.ts`: canvas in, canvas out.
 *
 * Kept separate so the bakers themselves stay testable in plain Node (no jsdom, no
 * GPU). Used by the runtime loaders (TS WebGPU, WebGL2, C++ tile upload) and by the
 * Mask Lab export, so the map a designer downloads is byte-identical to the map the
 * renderer uploads.
 */

import type { AuthoredBlockMaterial } from './blockMaterial.js';
import { getAuthoredBlockMaterial } from './blockMaterial.js';
import {
  bakeMaterialMapRgba,
  normalMapPreview,
  packedMetalRoughnessPreview,
  type MaterialMapBake,
} from './blockMaterialMaps.js';

function readRgba(canvas: HTMLCanvasElement): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create 2D context for material map bake');
  const { width, height } = canvas;
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

function writeRgba(data: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create 2D context for material map output');
  const image = ctx.createImageData(width, height);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Bake the packed runtime material map from an extracted albedo tile (whose alpha
 * already carries the metal mask).
 */
export function bakeMaterialMapFromTile(
  tile: HTMLCanvasElement,
  material: AuthoredBlockMaterial = getAuthoredBlockMaterial(),
): { bake: MaterialMapBake; canvas: HTMLCanvasElement } {
  const { data, width, height } = readRgba(tile);
  const bake = bakeMaterialMapRgba(data, width, height, material);
  return { bake, canvas: writeRgba(bake.rgba, width, height) };
}

/** Viewable packed metallic/roughness map (R = metallic, G = roughness). */
export function packedMetalRoughnessCanvas(bake: MaterialMapBake): HTMLCanvasElement {
  return writeRgba(packedMetalRoughnessPreview(bake), bake.width, bake.height);
}

/** Viewable tangent-space normal map (RGB), z reconstructed as the shader does. */
export function normalMapCanvas(bake: MaterialMapBake): HTMLCanvasElement {
  return writeRgba(normalMapPreview(bake), bake.width, bake.height);
}

/** Albedo-only copy of the tile (alpha forced opaque) for authoring handoff. */
export function albedoOnlyCanvas(tile: HTMLCanvasElement): HTMLCanvasElement {
  const { data, width, height } = readRgba(tile);
  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  for (let i = 0; i < width * height; i++) out[i * 4 + 3] = 255;
  return writeRgba(out, width, height);
}
