#!/usr/bin/env node
/**
 * Dev-only split-sum IBL baker (no native deps).
 *
 * Writes:
 *   public/ibl/specular_oct_mips.png  — 128px octahedral RGBM mip strip
 *   public/ibl/brdf_lut.png           — 128px DFG LUT
 *
 * Environment is a procedural warm photography studio (CC0-style, not a
 * downloaded HDRI) so CI never needs network or native CMGEN.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'ibl');
const BASE = 128;
const MIPS = 6;
const LUT = 128;
const RGBM_RANGE = 6;

function octDecode(u, v) {
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

function studio(dx, dy, dz) {
  const up = dy * 0.5 + 0.5;
  let r = 0.22 + (1.35 - 0.22) * up;
  let g = 0.12 + (1.05 - 0.12) * up;
  let b = 0.05 + (0.72 - 0.05) * up;
  const lights = [
    [[0.28, 0.62, 0.72], [6.5, 5.4, 3.6], 80],
    [[-0.55, 0.35, 0.55], [2.2, 1.4, 0.7], 22],
    [[0.15, 0.05, -0.9], [1.6, 1.15, 0.75], 14],
    [[0.0, 1.0, 0.12], [3.4, 2.8, 2.0], 40],
  ];
  for (const [d, col, exp] of lights) {
    const nd = Math.max(0, dx * d[0] + dy * d[1] + dz * d[2]);
    const w = nd ** exp;
    r += col[0] * w;
    g += col[1] * w;
    b += col[2] * w;
  }
  return [r, g, b];
}

function encodeRGBM(r, g, b) {
  const maxc = Math.max(r, g, b) / RGBM_RANGE;
  let m = Math.min(1, Math.max(1 / 255, maxc));
  m = Math.ceil(m * 255) / 255;
  return [
    Math.min(1, r / RGBM_RANGE / m),
    Math.min(1, g / RGBM_RANGE / m),
    Math.min(1, b / RGBM_RANGE / m),
    m,
  ];
}

function radicalInverse(bits) {
  bits = (bits << 16) | (bits >>> 16);
  bits = ((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1);
  bits = ((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2);
  bits = ((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4);
  bits = ((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8);
  return (bits >>> 0) * 2.3283064365386963e-10;
}

function hammersley(i, n) {
  return [i / n, radicalInverse(i)];
}

function ggxSample(xi0, xi1, roughness) {
  const a = roughness * roughness;
  const phi = 2 * Math.PI * xi0;
  const cosTheta = Math.sqrt((1 - xi1) / (1 + (a * a - 1) * xi1));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return [Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta];
}

function basis(n) {
  const up = Math.abs(n[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0];
  const t = [
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0],
  ];
  const tl = Math.hypot(...t) || 1;
  t[0] /= tl; t[1] /= tl; t[2] /= tl;
  const b = [
    n[1] * t[2] - n[2] * t[1],
    n[2] * t[0] - n[0] * t[2],
    n[0] * t[1] - n[1] * t[0],
  ];
  return [t, b];
}

function prefilter(dx, dy, dz, roughness, samples) {
  if (roughness < 0.04) return studio(dx, dy, dz);
  const N = [dx, dy, dz];
  const [T, B] = basis(N);
  let wr = 0, wg = 0, wb = 0, wsum = 0;
  for (let i = 0; i < samples; i++) {
    const [xi0, xi1] = hammersley(i, samples);
    const h = ggxSample(xi0, xi1, roughness);
    const H = [
      T[0] * h[0] + B[0] * h[1] + N[0] * h[2],
      T[1] * h[0] + B[1] * h[1] + N[1] * h[2],
      T[2] * h[0] + B[2] * h[1] + N[2] * h[2],
    ];
    const vdoth = Math.max(0, N[0] * H[0] + N[1] * H[1] + N[2] * H[2]);
    const L = [
      2 * vdoth * H[0] - N[0],
      2 * vdoth * H[1] - N[1],
      2 * vdoth * H[2] - N[2],
    ];
    const nDotL = Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
    if (nDotL > 0) {
      const col = studio(L[0], L[1], L[2]);
      wr += col[0] * nDotL;
      wg += col[1] * nDotL;
      wb += col[2] * nDotL;
      wsum += nDotL;
    }
  }
  const inv = wsum > 0 ? 1 / wsum : 0;
  return [wr * inv, wg * inv, wb * inv];
}

function schlickG(nDotV, roughness) {
  const k = (roughness * roughness) / 2;
  return nDotV / (nDotV * (1 - k) + k);
}

function dfg(nDotV, roughness, samples) {
  const V = [Math.sqrt(1 - nDotV * nDotV), 0, nDotV];
  let a = 0, b = 0;
  for (let i = 0; i < samples; i++) {
    const [xi0, xi1] = hammersley(i, samples);
    const H = ggxSample(xi0, xi1, roughness);
    const vDotH = Math.max(0, V[0] * H[0] + V[1] * H[1] + V[2] * H[2]);
    const L = [
      2 * vDotH * H[0] - V[0],
      2 * vDotH * H[1] - V[1],
      2 * vDotH * H[2] - V[2],
    ];
    const nDotL = Math.max(0, L[2]);
    const nDotH = Math.max(0, H[2]);
    if (nDotL > 0) {
      const G = schlickG(nDotV, roughness) * schlickG(nDotL, roughness);
      const GVis = (G * vDotH) / Math.max(nDotH * nDotV, 1e-5);
      const fc = (1 - vDotH) ** 5;
      a += (1 - fc) * GVis;
      b += fc * GVis;
    }
  }
  return [a / samples, b / samples];
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function writePng(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return new Promise((resolve, reject) => {
    const s = createWriteStream(path);
    s.on('finish', resolve);
    s.on('error', reject);
    s.end(png);
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const stripH = BASE * 2 - Math.floor(BASE / 2 ** (MIPS - 1));
  const spec = Buffer.alloc(BASE * stripH * 4);
  let yOff = 0;
  for (let mip = 0; mip < MIPS; mip++) {
    const size = BASE >> mip;
    const roughness = MIPS === 1 ? 0 : mip / (MIPS - 1);
    const samples = mip === 0 ? 1 : 24;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [dx, dy, dz] = octDecode((x + 0.5) / size, (y + 0.5) / size);
        const col = prefilter(dx, dy, dz, roughness, samples);
        const enc = encodeRGBM(col[0], col[1], col[2]);
        const i = ((yOff + y) * BASE + x) * 4;
        spec[i] = Math.round(enc[0] * 255);
        spec[i + 1] = Math.round(enc[1] * 255);
        spec[i + 2] = Math.round(enc[2] * 255);
        spec[i + 3] = Math.round(enc[3] * 255);
      }
    }
    yOff += size;
  }
  const lut = Buffer.alloc(LUT * LUT * 4);
  for (let y = 0; y < LUT; y++) {
    for (let x = 0; x < LUT; x++) {
      const nDotV = Math.max((x + 0.5) / LUT, 0.001);
      const roughness = (y + 0.5) / LUT;
      const [a, b] = dfg(nDotV, roughness, 32);
      const i = (y * LUT + x) * 4;
      lut[i] = Math.round(Math.min(1, a) * 255);
      lut[i + 1] = Math.round(Math.min(1, b) * 255);
      lut[i + 2] = 0;
      lut[i + 3] = 255;
    }
  }
  const specPath = join(OUT, 'specular_oct_mips.png');
  const lutPath = join(OUT, 'brdf_lut.png');
  await writePng(specPath, BASE, stripH, spec);
  await writePng(lutPath, LUT, LUT, lut);
  const hash = createHash('sha1').update(spec).update(lut).digest('hex').slice(0, 8);
  console.log(`Wrote ${specPath} (${BASE}x${stripH}) and ${lutPath} (${hash})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
