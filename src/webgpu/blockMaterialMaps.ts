/**
 * Bakes the authored material maps every renderer samples, from the extracted
 * albedo tile plus the {@link AuthoredBlockMaterial} contract.
 *
 * Everything here is a pure function over RGBA byte arrays — no canvas, no GPU —
 * so the *visual contract* can be asserted on CPU in `npm test` instead of only
 * by eyeballing a screenshot. `blockMaterialCanvas.ts` wraps these for the
 * browser/Mask Lab; `scripts/validate-block-material.mjs` runs the same metrics
 * over the checked-in PNGs at build time.
 *
 * Runtime packing (one texture, one binding, BC7-friendly):
 *   R = tangent normal.x   (0.5 = flat)
 *   G = tangent normal.y   (0.5 = flat)
 *   B = roughness
 *   A = metallic
 *
 * Normal.z is reconstructed in the shader (`sqrt(1 - x² - y²)`), which is why the
 * third channel is free for roughness.
 */

import type { AuthoredBlockMaterial } from './blockMaterial.js';
import { DEFAULT_AUTHORED_BLOCK_MATERIAL } from './blockMaterial.js';

/** Flat-normal / mid-roughness byte a 1×1 fallback texture uses. */
export const FLAT_NORMAL_BYTE = 128;

export interface MaterialMapBake {
  /** Packed runtime map (see module docs). */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

function luma(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function at(width: number, height: number, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return (cy * width + cx) * 4;
}

/**
 * Per-pixel height field the normal bake differentiates.
 *
 * Gold hinges carry the readable geometry, so the crystal interior is flattened
 * (`0.30 + 0.70 * metal`) instead of turning stained-glass noise into bumps.
 */
export function heightFieldFromAlbedo(
  albedo: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const metal = albedo[o + 3] / 255;
    out[i] = luma(albedo[o], albedo[o + 1], albedo[o + 2]) * (0.30 + 0.70 * metal);
  }
  return out;
}

/**
 * Local high-frequency energy (Sobel magnitude, normalised). Drives both the
 * normal bake and the roughness bake, so polish and bumps agree on where the
 * worked-metal detail is.
 */
export function detailFieldFromHeight(
  heights: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = (dx: number, dy: number) => heights[at(width, height, x + dx, y + dy) / 4];
      const gx =
        h(-1, -1) + 2 * h(-1, 0) + h(-1, 1) - (h(1, -1) + 2 * h(1, 0) + h(1, 1));
      const gy =
        h(-1, -1) + 2 * h(0, -1) + h(1, -1) - (h(-1, 1) + 2 * h(0, 1) + h(1, 1));
      out[y * width + x] = Math.min(1, Math.hypot(gx, gy) / 4);
    }
  }
  return out;
}

/**
 * Roughness for one pixel.
 *
 * High-frequency gold detail reads as *polish* on jewelry (burnished edges catch
 * tight highlights), so detail lowers roughness on metal; the crystal is pinned to
 * the near-polished 0.02–0.08 band transmission needs regardless of tile noise.
 */
export function bakeRoughnessValue(
  metal: number,
  detail: number,
  material: AuthoredBlockMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL,
): number {
  const glassRough = Math.min(0.08, Math.max(0.02, material.roughness.glass));
  if (metal < 0.5) return glassRough;
  const polished = 1 - material.roughness.detail * detail;
  return clamp01(Math.max(0.04, material.roughness.metal * polished));
}

/**
 * Bake the packed runtime material map from an extracted albedo tile whose alpha
 * already carries the baked metal mask (see `blockTextureExtract.ts`).
 */
export function bakeMaterialMapRgba(
  albedo: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  material: AuthoredBlockMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL,
): MaterialMapBake {
  const heights = heightFieldFromAlbedo(albedo, width, height);
  const detail = detailFieldFromHeight(heights, width, height);
  const out = new Uint8ClampedArray(width * height * 4);
  // dz scales the gradient into tangent space: a *low* strength means a *tall* z,
  // i.e. a flatter surface. Hinges must stay readable at playfield size.
  const strength = Math.max(0.0001, material.normal.strength);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const metal = albedo[o + 3] / 255;

      const hx =
        heights[at(width, height, x + 1, y) / 4] - heights[at(width, height, x - 1, y) / 4];
      const hy =
        heights[at(width, height, x, y + 1) / 4] - heights[at(width, height, x, y - 1) / 4];

      // Tangent-space normal of the height field, scaled by the authored strength.
      let nx = -hx * strength * 8;
      let ny = -hy * strength * 8;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;

      out[o + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(bakeRoughnessValue(metal, detail[i], material) * 255);
      out[o + 3] = Math.round(metal * 255);
    }
  }

  return { rgba: out, width, height };
}

/** Viewable metallic/roughness map (R = metallic, G = roughness) for authoring. */
export function packedMetalRoughnessPreview(map: MaterialMapBake): Uint8ClampedArray {
  const out = new Uint8ClampedArray(map.rgba.length);
  for (let i = 0; i < map.width * map.height; i++) {
    const o = i * 4;
    out[o + 0] = map.rgba[o + 3];
    out[o + 1] = map.rgba[o + 2];
    out[o + 2] = 0;
    out[o + 3] = 255;
  }
  return out;
}

/** Viewable tangent-space normal map (RGB), z reconstructed the way the shader does. */
export function normalMapPreview(map: MaterialMapBake): Uint8ClampedArray {
  const out = new Uint8ClampedArray(map.rgba.length);
  for (let i = 0; i < map.width * map.height; i++) {
    const o = i * 4;
    const nx = (map.rgba[o + 0] / 255) * 2 - 1;
    const ny = (map.rgba[o + 1] / 255) * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    out[o + 0] = map.rgba[o + 0];
    out[o + 1] = map.rgba[o + 1];
    out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    out[o + 3] = 255;
  }
  return out;
}

/** 1×1 flat fallback so the material-map binding is never left unbound. */
export function flatMaterialMapPixel(
  material: AuthoredBlockMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL,
): Uint8Array {
  return new Uint8Array([
    FLAT_NORMAL_BYTE,
    FLAT_NORMAL_BYTE,
    Math.round(material.roughness.metal * 255),
    255,
  ]);
}

// ---------------------------------------------------------------------------
// The visual contract, measured
// ---------------------------------------------------------------------------

export interface MaterialContractMetrics {
  /** Mean metal mask inside the outer ring — the gold jewelry frame. */
  borderMetalMean: number;
  /** Mean glass mask over the centre disc — the crystal well. */
  centerGlassMean: number;
  /** Fraction of pixels in the soft transition band (0 < alpha < 255). */
  haloFraction: number;
  /** Fraction of the tile classified as metal. */
  metalFraction: number;
  /** Mean roughness of metal / glass pixels (NaN when the class is empty). */
  metalRoughnessMean: number;
  glassRoughnessMean: number;
}

export interface ContractSampleOptions {
  /** Ring thickness in UV units measured from the tile edge. */
  borderFraction?: number;
  /** Radius (UV units) of the centre disc treated as "the crystal well". */
  centerRadius?: number;
}

/**
 * Measure the authored tile against the contract.
 *
 * `albedo` supplies the metal mask in alpha; `materialMap` (optional) supplies
 * roughness in blue. Both are the exact byte layouts the renderers upload, so a
 * regression in the extractor shows up here before it reaches a screenshot.
 */
export function measureBlockMaterialContract(
  albedo: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  materialMap?: Uint8ClampedArray | Uint8Array,
  options: ContractSampleOptions = {},
): MaterialContractMetrics {
  const borderFraction = options.borderFraction ?? 0.1;
  const centerRadius = options.centerRadius ?? 0.22;

  let borderSum = 0;
  let borderCount = 0;
  let centerSum = 0;
  let centerCount = 0;
  let halo = 0;
  let metalCount = 0;
  let metalRoughSum = 0;
  let glassRoughSum = 0;
  let metalRoughCount = 0;
  let glassRoughCount = 0;

  const uDen = Math.max(1, width - 1);
  const vDen = Math.max(1, height - 1);

  for (let y = 0; y < height; y++) {
    const v = y / vDen;
    for (let x = 0; x < width; x++) {
      const u = x / uDen;
      const o = (y * width + x) * 4;
      const a = albedo[o + 3];
      const metal = a / 255;

      if (a > 0 && a < 255) halo++;
      if (metal >= 0.5) metalCount++;

      const distEdge = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
      if (distEdge < borderFraction) {
        borderSum += metal;
        borderCount++;
      }
      if (Math.hypot(u - 0.5, v - 0.5) < centerRadius) {
        centerSum += 1 - metal;
        centerCount++;
      }

      if (materialMap) {
        const rough = materialMap[o + 2] / 255;
        if (metal >= 0.5) {
          metalRoughSum += rough;
          metalRoughCount++;
        } else {
          glassRoughSum += rough;
          glassRoughCount++;
        }
      }
    }
  }

  const total = width * height;
  return {
    borderMetalMean: borderCount ? borderSum / borderCount : 0,
    centerGlassMean: centerCount ? centerSum / centerCount : 0,
    haloFraction: halo / total,
    metalFraction: metalCount / total,
    metalRoughnessMean: metalRoughCount ? metalRoughSum / metalRoughCount : NaN,
    glassRoughnessMean: glassRoughCount ? glassRoughSum / glassRoughCount : NaN,
  };
}

export interface ContractCheck {
  ok: boolean;
  failures: string[];
  metrics: MaterialContractMetrics;
}

/** Apply the thresholds from `block-material.json` to measured metrics. */
export function checkBlockMaterialContract(
  metrics: MaterialContractMetrics,
  material: AuthoredBlockMaterial = DEFAULT_AUTHORED_BLOCK_MATERIAL,
): ContractCheck {
  const failures: string[] = [];
  const { borderMetalMin, centerGlassMin, haloMaxFraction } = material.contract;

  if (metrics.borderMetalMean < borderMetalMin) {
    failures.push(
      `gold frame too thin: border metal mean ${metrics.borderMetalMean.toFixed(3)} < ${borderMetalMin}`,
    );
  }
  if (metrics.centerGlassMean < centerGlassMin) {
    failures.push(
      `crystal well not transmissive: centre glass mean ${metrics.centerGlassMean.toFixed(3)} < ${centerGlassMin}`,
    );
  }
  if (metrics.haloFraction > haloMaxFraction) {
    failures.push(
      `mask halo too wide: ${(metrics.haloFraction * 100).toFixed(1)}% of pixels in the feather band > ${(haloMaxFraction * 100).toFixed(1)}%`,
    );
  }
  if (
    Number.isFinite(metrics.metalRoughnessMean) &&
    Number.isFinite(metrics.glassRoughnessMean) &&
    metrics.glassRoughnessMean > metrics.metalRoughnessMean
  ) {
    failures.push(
      `crystal rougher than gold (${metrics.glassRoughnessMean.toFixed(3)} > ${metrics.metalRoughnessMean.toFixed(3)})`,
    );
  }

  return { ok: failures.length === 0, failures, metrics };
}

/**
 * Intersection-over-union of two binary masks read from alpha. Used to assert a
 * re-bake (new extractor tuning, a ported map, a content pack) still segments the
 * tile the same way the reference does.
 */
export function maskIoU(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  bytesPerPixel = 4,
): number {
  const alphaOffset = bytesPerPixel === 4 ? 3 : 0;
  const count = Math.min(a.length, b.length) / bytesPerPixel;
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < count; i++) {
    const av = a[i * bytesPerPixel + alphaOffset] >= 128;
    const bv = b[i * bytesPerPixel + alphaOffset] >= 128;
    if (av && bv) intersection++;
    if (av || bv) union++;
  }
  return union === 0 ? 1 : intersection / union;
}
