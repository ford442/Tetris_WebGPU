/**
 * Pure-CPU half of the GPU chores parity suite: deterministic fixtures, CPU reference ports and
 * the shapes of what the GPU job returns. Imported by both the Vitest file (to compute the
 * expectations) and `jobs/chores.ts` (to build the GPU inputs), so they cannot drift.
 */

import { buildSpawnFlags, BOARD_CELLS } from '../../src/webgpu/gpuChores/compact.js';
import {
  LUMA_HISTOGRAM_BINS,
  LUMA_HISTOGRAM_MAX,
  LUMA_WEIGHTS,
  lumaBin,
  type LumaStats,
} from '../../src/webgpu/gpuChores/lumaStats.js';
import { PARTICLE_STRIDE_FLOATS } from '../../src/webgpu/particles/layout.js';
import { mulberry32, roundToHalf, toHalfBits } from './gpuIo.js';

export { mulberry32 };

// ---------------------------------------------------------------------------
// Fixtures (pure CPU, built before any GPU work)
// ---------------------------------------------------------------------------

export type Rgba8 = { width: number; height: number; data: Uint8Array };

export function randomRgba8(width: number, height: number, seed: number): Rgba8 {
  const rnd = mulberry32(seed);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    // A dark-biased mix with a bright tail, like a Tetris frame.
    const bright = rnd() < 0.08 ? 1 : 0.35;
    data[i] = Math.floor(rnd() * 256 * bright);
    data[i + 1] = Math.floor(rnd() * 256 * bright);
    data[i + 2] = Math.floor(rnd() * 256 * bright);
    data[i + 3] = 255;
    // Keep every texel clear of a bin edge (see assertClearOfBinEdges) by nudging red.
    for (let guard = 0; guard < 8 && nearBinEdge(lumaOf(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)); guard++) {
      data[i] = (data[i] + 1) & 255;
    }
  }
  return { width, height, data };
}

/**
 * Clearance (in bin widths) a texel must keep from a bin edge. f32 vs f64 luma differ by ~1e-7
 * relative, i.e. < 1e-5 bin widths, so 3e-5 makes the CPU and GPU bin choice identical.
 */
const EDGE_MARGIN = 3e-5;

export function nearBinEdge(luma: number, max = LUMA_HISTOGRAM_MAX, margin = 1e-3): boolean {
  if (!(luma > 0) || luma >= max) return false;
  const x = (luma / max) * LUMA_HISTOGRAM_BINS;
  const frac = x - Math.floor(x);
  return frac < margin || 1 - frac < margin;
}

export const lumaOf = (r: number, g: number, b: number): number =>
  r * LUMA_WEIGHTS[0] + g * LUMA_WEIGHTS[1] + b * LUMA_WEIGHTS[2];

/**
 * The GPU computes the bin in f32; the CPU rung in f64. They only disagree for a luma within
 * ~1e-7 of a bin edge, so fixtures are checked to keep clear of every edge: then equality is
 * exact by construction rather than by luck of the seed.
 */
export function assertClearOfBinEdges(lumas: Iterable<number>, max: number): void {
  let checked = 0;
  for (const l of lumas) {
    checked++;
    if (nearBinEdge(l, max, EDGE_MARGIN)) throw new Error(`fixture luma ${l} sits on a bin edge`);
  }
  if (checked === 0) throw new Error('empty fixture');
}

/** rgba8 fixtures for luma_histogram: odd sizes force partial workgroups and the bounds guard. */
export const LUMA_CASES = [
  { name: '37x23 (partial workgroups)', ...randomRgba8(37, 23, 11) },
  { name: '100x75', ...randomRgba8(100, 75, 12) },
  { name: '8x8 (exactly one workgroup)', ...randomRgba8(8, 8, 13) },
  { name: '1x1', ...randomRgba8(1, 1, 14) },
];
for (const c of LUMA_CASES) {
  const lumas: number[] = [];
  for (let i = 0; i < c.data.length; i += 4) lumas.push(lumaOf(c.data[i] / 255, c.data[i + 1] / 255, c.data[i + 2] / 255));
  assertClearOfBinEdges(lumas, LUMA_HISTOGRAM_MAX);
}

/** HDR fixture (rgba16float): values past the histogram range, zero and negatives. */
export function hdrFixture(width: number, height: number) {
  const rnd = mulberry32(99);
  const values = new Float32Array(width * height * 4);
  for (let i = 0; i < values.length; i += 4) {
    const k = rnd();
    const scale = k < 0.1 ? 6.0 : k < 0.15 ? -0.5 : k < 0.2 ? 0 : 1.1;
    for (let c = 0; c < 3; c++) values[i + c] = roundToHalf(rnd() * scale);
    values[i + 3] = 1;
  }
  const halves = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) halves[i] = toHalfBits(values[i]);
  const reference = new Uint32Array(LUMA_HISTOGRAM_BINS);
  const lumas: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const l = lumaOf(values[i], values[i + 1], values[i + 2]);
    lumas.push(l);
    reference[lumaBin(l)] += 1;
  }
  assertClearOfBinEdges(lumas, LUMA_HISTOGRAM_MAX);
  return { width, height, halves, reference };
}
export const HDR = hdrFixture(53, 31);

/** downsample cases. Ratios are exact binary fractions, so f32 and f64 pick the same texels. */
export const DOWNSAMPLE_CASES = [
  { name: '64x32 -> 16x8 (4:1)', src: randomRgba8(64, 32, 21), dw: 16, dh: 8 },
  { name: '40x24 -> 32x16 (1.25:1, non-power-of-two tail)', src: randomRgba8(40, 24, 22), dw: 32, dh: 16 },
  { name: '48x30 -> 32x20 (1.5:1)', src: randomRgba8(48, 30, 23), dw: 32, dh: 20 },
];

/** CPU port of `downsample_2d`, with the f16 rounding of its rgba16float target. */
export function cpuDownsample(src: Rgba8, dw: number, dh: number): Float32Array {
  const rx = Math.fround(src.width / dw);
  const ry = Math.fround(src.height / dh);
  const out = new Float32Array(dw * dh * 4);
  const texel = (x: number, y: number, c: number): number => src.data[(y * src.width + x) * 4 + c] / 255;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const px = Math.min(Math.max(Math.trunc(x * rx + dx * rx * 0.5), 0), src.width - 1);
            const py = Math.min(Math.max(Math.trunc(y * ry + dy * ry * 0.5), 0), src.height - 1);
            acc += texel(px, py, c);
          }
        }
        out[(y * dw + x) * 4 + c] = roundToHalf(acc * 0.25);
      }
    }
  }
  return out;
}

/**
 * 512x384 frame: a 2:1 reduction into the runner's 256x192 scan target. The downsampled texels
 * (not the source ones) are what the histogram bins, so the seed is picked deterministically
 * as the first one whose *reduced* image keeps clear of every bin edge.
 */
export const FRAME = pickFrame();

export function pickFrame(): Rgba8 {
  for (let seed = 31; seed < 131; seed++) {
    const frame = randomRgba8(512, 384, seed);
    const small = cpuDownsample(frame, 256, 192);
    let ok = true;
    for (let i = 0; i < small.length && ok; i += 4) ok = !nearBinEdge(lumaOf(small[i], small[i + 1], small[i + 2]), LUMA_HISTOGRAM_MAX, EDGE_MARGIN);
    if (ok) return frame;
  }
  throw new Error('no edge-free 512x384 fixture in 100 seeds');
}

/** Flag sets for compact_indices. */
export function flagSets(): Array<{ name: string; flags: number[]; maxOut?: number }> {
  const rnd = mulberry32(7);
  const sparse = Array.from({ length: BOARD_CELLS }, () => (rnd() < 0.2 ? 1 : 0));
  const dense = Array.from({ length: BOARD_CELLS }, () => (rnd() < 0.85 ? 1 : 0));
  const rows = Array.from(buildSpawnFlags([17, 18, 19], null));
  const thinned = Array.from(buildSpawnFlags([4, 5], null, { maxParticles: 900 }));
  return [
    { name: 'empty', flags: new Array(BOARD_CELLS).fill(0) },
    { name: 'full board', flags: new Array(BOARD_CELLS).fill(1) },
    { name: 'sparse random', flags: sparse },
    { name: 'dense random', flags: dense },
    { name: 'three cleared rows', flags: rows },
    { name: 'budget-thinned rows', flags: thinned },
    { name: 'truncated by maxOut', flags: dense, maxOut: 37 },
    { name: 'last cell only', flags: Array.from({ length: BOARD_CELLS }, (_, i) => (i === BOARD_CELLS - 1 ? 1 : 0)) },
    { name: 'not a multiple of the workgroup', flags: sparse.slice(0, 131) },
  ];
}


export interface LineClearRun {
  board: Uint32Array;
  dissolveIn: Float32Array;
  flagsIn: Uint32Array;
  dissolveOut: Float32Array;
  flagsOut: Uint32Array;
  clearedCount: number;
  mask: Uint32Array;
  dt: number;
  decay: number;
}

export interface ParticleRun {
  name: string;
  input: Float32Array;
  output: Float32Array;
  uniforms: { dt: number; time: number; shockwaveTimer: number; center: [number, number]; params: [number, number, number, number] };
}

export interface GpuResults {
  lumaRgba8: Uint32Array[];
  lumaHdr: Uint32Array;
  downsample: Float32Array[];
  compact: Array<{ gpu: Uint32Array; stillOnGpu: boolean }>;
  scan: { stats: LumaStats; backend: string; readbacks: number; scans: number } | null;
  lineClear: LineClearRun[];
  particles: ParticleRun[];
}

// ---------------------------------------------------------------------------
// Particle fixtures + CPU port of the physics step
// ---------------------------------------------------------------------------

export const P = { X: 0, Y: 1, Z: 2, VX: 4, VY: 5, VZ: 6, R: 8, G: 9, B: 10, A: 11, SCALE: 12, LIFE: 13, MAX_LIFE: 14 };

export function particleScenarios(): Array<Omit<ParticleRun, 'output'>> {
  const rnd = mulberry32(2024);
  const count = 130; // three workgroups, the last one partial: exercises the arrayLength guard
  const make = (): Float32Array => {
    const data = new Float32Array(count * PARTICLE_STRIDE_FLOATS);
    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_STRIDE_FLOATS;
      data[o + P.X] = 4 + rnd() * 12;
      data[o + P.Y] = -30 + rnd() * 40;
      data[o + P.Z] = (rnd() - 0.5) * 20;
      data[o + P.VX] = (rnd() - 0.5) * 10;
      data[o + P.VY] = (rnd() - 0.5) * 10;
      data[o + P.VZ] = (rnd() - 0.5) * 10;
      data[o + P.R] = rnd(); data[o + P.G] = rnd(); data[o + P.B] = rnd(); data[o + P.A] = 1;
      data[o + P.SCALE] = 1;
      data[o + P.MAX_LIFE] = 1 + rnd() * 2;
      data[o + P.LIFE] = data[o + P.MAX_LIFE] * (0.2 + rnd() * 0.8);
    }
    const set = (i: number, patch: Partial<Record<keyof typeof P, number>>): void => {
      for (const [k, v] of Object.entries(patch)) data[i * PARTICLE_STRIDE_FLOATS + P[k as keyof typeof P]] = v as number;
    };
    set(0, { LIFE: 0 });                         // dead: must stay byte-identical
    set(1, { LIFE: -1, SCALE: 0.5 });            // dead
    set(2, { Y: -44.5, VY: -3 });                // below the floor: bounce
    set(3, { Y: -59.9, VY: -50 });               // falls out of the world: culled
    set(4, { X: 60, VX: 5 });                    // out of x bounds: culled
    set(5, { Z: 39.9, VZ: 40 });                 // out of z bounds: culled
    set(6, { LIFE: 0.004, MAX_LIFE: 2 });        // dies this step
    return data;
  };
  const base = { dt: 1 / 60, time: 3.7 };
  return [
    { name: 'no shockwave', input: make(), uniforms: { ...base, shockwaveTimer: 0, center: [0.5, 0.5], params: [0.1, 1, 0, 1] } },
    { name: 'shockwave ring crossing particles', input: make(), uniforms: { ...base, shockwaveTimer: 0.4, center: [0.5, 0.45], params: [0.4, 1.2, 0.3, 1.0] } },
  ];
}

/** Port of `main()` in ParticleComputeShader, in f64. */
export function cpuParticleStep(input: Float32Array, u: ParticleRun['uniforms']): Float32Array {
  const out = new Float32Array(input);
  const count = input.length / PARTICLE_STRIDE_FLOATS;
  for (let i = 0; i < count; i++) {
    const o = i * PARTICLE_STRIDE_FLOATS;
    let life = input[o + P.LIFE];
    if (life <= 0) continue;
    const dt = u.dt;
    const maxLife = input[o + P.MAX_LIFE];
    const pos = [input[o + P.X], input[o + P.Y], input[o + P.Z]];
    const vel = [input[o + P.VX], input[o + P.VY], input[o + P.VZ]];
    let scale = input[o + P.SCALE];

    vel[1] += -9.81 * 1.5 * dt;
    const drag = 1 / (1 + 2 * dt);
    for (let k = 0; k < 3; k++) vel[k] *= drag;

    const q = pos.map((c) => c * 0.5 + u.time * 0.5);
    const turb = [
      Math.sin(q[1] * 10 + q[2] * 5),
      Math.sin(q[2] * 10 + q[0] * 5),
      Math.sin(q[0] * 10 + q[1] * 5),
    ].map((t) => t * 5);
    const lifeRatio = life / maxLife;
    for (let k = 0; k < 3; k++) vel[k] += turb[k] * dt * (1 - lifeRatio);

    if (pos[1] < -43) {
      pos[1] = -43;
      vel[1] *= -0.6;
      vel[0] *= 0.8;
      vel[2] *= 0.8;
    }

    if (u.shockwaveTimer > 0 && u.shockwaveTimer < 1) {
      const world = [(u.center[0] - 0.5) * 40 + 9, (0.5 - u.center[1]) * 50 - 20, 0];
      const d = [pos[0] - world[0], pos[1] - world[1], pos[2] - world[2]];
      const dist = Math.hypot(d[0], d[1], d[2]);
      const radius = u.shockwaveTimer * Math.max(u.params[3], 0.1) * 60;
      const width = u.params[0] * 20;
      const diff = Math.abs(dist - radius);
      if (diff < width) {
        const t = Math.min(Math.max(diff / width, 0), 1);
        const falloff = 1 - t * t * (3 - 2 * t);
        const strength = u.params[1] * 500;
        for (let k = 0; k < 3; k++) vel[k] += (d[k] / dist) * strength * falloff * dt;
      }
    }

    for (let k = 0; k < 3; k++) pos[k] += vel[k] * dt;
    life -= dt;
    if (pos[1] < -60 || Math.abs(pos[2]) > 40 || Math.abs(pos[0] - 10) > 35) {
      life = -1;
      scale = 0;
    }
    scale = Math.sin((life / maxLife) * 3.14159 * 0.5);
    if (life < 0) {
      scale = 0;
      life = -1;
    }
    out[o + P.X] = pos[0]; out[o + P.Y] = pos[1]; out[o + P.Z] = pos[2];
    out[o + P.VX] = vel[0]; out[o + P.VY] = vel[1]; out[o + P.VZ] = vel[2];
    out[o + P.SCALE] = scale;
    out[o + P.LIFE] = life;
  }
  return out;
}

