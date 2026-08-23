/**
 * CPU helpers for split-sum IBL (octahedral mapping, GGX DFG, RGBM).
 * Used by tests and the optional `scripts/prefilter-ibl.mjs` generator.
 */

export const RGBM_MAX_RANGE = 6.0;

export function octEncode(nx: number, ny: number, nz: number): [number, number] {
  const l1 = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1;
  let x = nx / l1;
  let y = ny / l1;
  if (nz < 0) {
    const ox = x;
    x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1);
    y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1);
  }
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

export function octDecode(u: number, v: number): [number, number, number] {
  let x = u * 2 - 1;
  let y = v * 2 - 1;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const ox = x;
    x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1);
    y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1);
  }
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** Warm studio radiance (Poly Haven-style photography studio, no sine blobs). */
export function sampleStudioRadiance(dx: number, dy: number, dz: number): [number, number, number] {
  const up = dy * 0.5 + 0.5;
  const floorCol: [number, number, number] = [0.22, 0.12, 0.05];
  const ceilingCol: [number, number, number] = [1.35, 1.05, 0.72];
  let r = floorCol[0] + (ceilingCol[0] - floorCol[0]) * up;
  let g = floorCol[1] + (ceilingCol[1] - floorCol[1]) * up;
  let b = floorCol[2] + (ceilingCol[2] - floorCol[2]) * up;

  const lights: Array<{ d: [number, number, number]; col: [number, number, number]; exp: number }> = [
    { d: [0.28, 0.62, 0.72], col: [6.5, 5.4, 3.6], exp: 80 },
    { d: [-0.55, 0.35, 0.55], col: [2.2, 1.4, 0.7], exp: 22 },
    { d: [0.15, 0.05, -0.9], col: [1.6, 1.15, 0.75], exp: 14 },
    { d: [0.0, 1.0, 0.12], col: [3.4, 2.8, 2.0], exp: 40 },
  ];
  for (const L of lights) {
    const nd = Math.max(0, dx * L.d[0] + dy * L.d[1] + dz * L.d[2]);
    const w = nd ** L.exp;
    r += L.col[0] * w;
    g += L.col[1] * w;
    b += L.col[2] * w;
  }
  return [r, g, b];
}

export function encodeRGBM(r: number, g: number, b: number): [number, number, number, number] {
  const maxc = Math.max(r, g, b) / RGBM_MAX_RANGE;
  let m = Math.min(1, Math.max(1 / 255, maxc));
  m = Math.ceil(m * 255) / 255;
  return [
    Math.min(1, r / RGBM_MAX_RANGE / m),
    Math.min(1, g / RGBM_MAX_RANGE / m),
    Math.min(1, b / RGBM_MAX_RANGE / m),
    m,
  ];
}

export function decodeRGBM(r: number, g: number, b: number, m: number): [number, number, number] {
  return [r * m * RGBM_MAX_RANGE, g * m * RGBM_MAX_RANGE, b * m * RGBM_MAX_RANGE];
}

function radicalInverseVdC(bits: number): number {
  bits = (bits << 16) | (bits >>> 16);
  bits = ((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1);
  bits = ((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2);
  bits = ((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4);
  bits = ((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8);
  return (bits >>> 0) * 2.3283064365386963e-10;
}

export function hammersley(i: number, n: number): [number, number] {
  return [i / n, radicalInverseVdC(i)];
}

function importanceSampleGGX(xi0: number, xi1: number, roughness: number): [number, number, number] {
  const a = roughness * roughness;
  const phi = 2 * Math.PI * xi0;
  const cosTheta = Math.sqrt((1 - xi1) / (1 + (a * a - 1) * xi1));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return [Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta];
}

function geometrySchlickGGX(nDotV: number, roughness: number): number {
  const k = (roughness * roughness) / 2;
  return nDotV / (nDotV * (1 - k) + k);
}

function geometrySmith(nDotV: number, nDotL: number, roughness: number): number {
  return geometrySchlickGGX(nDotV, roughness) * geometrySchlickGGX(nDotL, roughness);
}

/** Split-sum DFG LUT sample (scale, bias) for given NdotV and roughness. */
export function integrateDfg(nDotV: number, roughness: number, sampleCount = 64): [number, number] {
  const V: [number, number, number] = [Math.sqrt(1 - nDotV * nDotV), 0, nDotV];
  let a = 0;
  let b = 0;
  const N: [number, number, number] = [0, 0, 1];
  for (let i = 0; i < sampleCount; i++) {
    const xi = hammersley(i, sampleCount);
    const Hlocal = importanceSampleGGX(xi[0], xi[1], roughness);
    const H = Hlocal;
    const L: [number, number, number] = [
      2 * Math.max(0, V[0] * H[0] + V[1] * H[1] + V[2] * H[2]) * H[0] - V[0],
      2 * Math.max(0, V[0] * H[0] + V[1] * H[1] + V[2] * H[2]) * H[1] - V[1],
      2 * Math.max(0, V[0] * H[0] + V[1] * H[1] + V[2] * H[2]) * H[2] - V[2],
    ];
    const nDotL = Math.max(0, L[2]);
    const nDotH = Math.max(0, H[2]);
    const vDotH = Math.max(0, V[0] * H[0] + V[1] * H[1] + V[2] * H[2]);
    if (nDotL > 0) {
      const G = geometrySmith(nDotV, nDotL, roughness);
      const GVis = (G * vDotH) / Math.max(nDotH * nDotV, 1e-5);
      const fc = (1 - vDotH) ** 5;
      a += (1 - fc) * GVis;
      b += fc * GVis;
    }
    void N;
  }
  return [a / sampleCount, b / sampleCount];
}

export function pixelRoughnessFromMetalMask(metalMask: number): number {
  return 0.12 * metalMask + 0.35 * (1 - metalMask);
}
