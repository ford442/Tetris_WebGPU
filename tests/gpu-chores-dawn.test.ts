/**
 * Layer 2: the WGSL compute kernels, actually executed (Dawn Node on a software Vulkan
 * adapter), compared with their CPU rungs.
 *
 *   luma_histogram   vs cpuLumaHistogram / a float reference (HDR, negatives, odd sizes)
 *   downsample_2d    vs a CPU port of the kernel, incl. the f16 rounding of its storage target
 *   compact_indices  vs compactIndicesCpu, through GpuChoreRunner.compactIndicesOnGpu
 *   luma chore       GpuChoreRunner.encodeLumaScan end to end -> histogramToStats
 *   line clear       detect_lines vs board row detection (lineUtils.rowsFromClearMask)
 *   particle         ParticleComputeShader vs a CPU port of the physics step
 *
 * With no adapter this suite is skipped *with a printed reason*; with TETRIS_REQUIRE_GPU=1
 * (CI) it fails. A GPU rung that silently degraded to its CPU fallback would make a parity
 * test pass trivially, so every runner-driven check also asserts the GPU rung stayed enabled.
 *
 * The kernels run in one sequential pass at module scope (tests/helpers/jobs/chores.ts); the
 * `it`s below assert on what it produced.
 */

import { describe, expect, it } from 'vitest';

import { compactIndicesCpu } from '../src/webgpu/gpuChores/compact.js';
import {
  cpuLumaHistogram,
  histogramToStats,
  LUMA_HISTOGRAM_BINS,
  LUMA_HISTOGRAM_MAX,
  lumaBin,
} from '../src/webgpu/gpuChores/lumaStats.js';
import { PARTICLE_STRIDE_FLOATS } from '../src/webgpu/particles/layout.js';
import { rowsFromClearMask } from '../src/game/lineUtils.js';
import { acquireDawn, gpuRequired, skipMessage } from './helpers/dawn.js';
import {
  assertClearOfBinEdges,
  cpuDownsample,
  cpuParticleStep,
  DOWNSAMPLE_CASES,
  flagSets,
  FRAME,
  HDR,
  LUMA_CASES,
  lumaOf,
  P,
  particleScenarios,
  type GpuResults,
} from './helpers/choresFixtures.js';
import { run as runChores } from './helpers/jobs/chores.js';

const dawn = await acquireDawn();
const required = gpuRequired();
const available = dawn.ok;
const gpu: GpuResults | null = dawn.ok ? await runChores(dawn.gpu.device) : null;
if (!dawn.ok && !required) console.warn(skipMessage('gpu-chores-dawn', dawn.reason));
if (dawn.ok) console.info(`[gpu-chores-dawn] ${dawn.gpu.description}`);

describe.skipIf(!available && !required)('GPU chores on a software WebGPU adapter', () => {
  it('has an adapter (required when TETRIS_REQUIRE_GPU=1)', () => {
    if (!dawn.ok) throw new Error(`TETRIS_REQUIRE_GPU=1 but no adapter: ${dawn.reason}`);
    expect(gpu).not.toBeNull();
  });

  describe('luma_histogram', () => {
    it.skipIf(!available).each(LUMA_CASES.map((c, i) => [c.name, i] as const))('matches cpuLumaHistogram on %s', (_n, i) => {
      const expected = cpuLumaHistogram(LUMA_CASES[i].data);
      const actual = gpu!.lumaRgba8[i];
      expect(Array.from(actual)).toEqual(Array.from(expected));
      // Out-of-range texels are skipped, never clamped-and-recounted: totals are exact.
      expect(actual.reduce((a, b) => a + b, 0)).toBe(LUMA_CASES[i].width * LUMA_CASES[i].height);
    });

    it.skipIf(!available)('bins HDR, zero and negative texels like lumaBin (top bin / bin 0)', () => {
      expect(Array.from(gpu!.lumaHdr)).toEqual(Array.from(HDR.reference));
      expect(gpu!.lumaHdr[LUMA_HISTOGRAM_BINS - 1]).toBeGreaterThan(0);
      expect(gpu!.lumaHdr[0]).toBeGreaterThan(0);
    });
  });

  describe('downsample_2d', () => {
    it.skipIf(!available).each(DOWNSAMPLE_CASES.map((c, i) => [c.name, i] as const))('matches the CPU port on %s', (_n, i) => {
      const c = DOWNSAMPLE_CASES[i];
      const expected = cpuDownsample(c.src, c.dw, c.dh);
      const actual = gpu!.downsample[i];
      let worst = 0;
      for (let k = 0; k < expected.length; k++) worst = Math.max(worst, Math.abs(actual[k] - expected[k]));
      // Same f16 store on both sides: the only slack is one half-float ulp from f32 summation order.
      expect(worst).toBeLessThan(1.5e-3);
    });
  });

  describe('compact_indices (GPU rung vs CPU rung)', () => {
    const sets = flagSets();
    it.skipIf(!available).each(sets.map((s, i) => [s.name, i] as const))('is identical to compactIndicesCpu: %s', (_n, i) => {
      const set = sets[i];
      const expected = compactIndicesCpu(set.flags, set.maxOut ?? set.flags.length);
      expect(Array.from(gpu!.compact[i].gpu)).toEqual(Array.from(expected));
      // A failure would silently fall back to the CPU rung and pass the line above for free.
      expect(gpu!.compact[i].stillOnGpu, 'GPU rung must not have degraded').toBe(true);
    });
  });

  describe('GpuChoreRunner luma scan (downsample_2d -> luma_histogram -> readback)', () => {
    it.skipIf(!available)('measures the same stats as the CPU pipeline', () => {
      const scan = gpu!.scan!;
      expect(scan.backend).toBe('webgpu');
      expect(scan.scans).toBe(1);
      expect(scan.readbacks, 'readback never landed').toBe(1);

      // CPU pipeline: 2:1 box downsample (stored as f16), then Rec.709 luma into 64 bins.
      const small = cpuDownsample(FRAME, 256, 192);
      const bins = new Uint32Array(LUMA_HISTOGRAM_BINS);
      const lumas: number[] = [];
      for (let i = 0; i < small.length; i += 4) {
        const l = lumaOf(small[i], small[i + 1], small[i + 2]);
        lumas.push(l);
        bins[lumaBin(l)] += 1;
      }
      assertClearOfBinEdges(lumas, LUMA_HISTOGRAM_MAX);
      const want = histogramToStats(bins);
      const binWidth = LUMA_HISTOGRAM_MAX / LUMA_HISTOGRAM_BINS;

      // Not bit-exact on purpose: the scan target is rgba16float and Vulkan lets a driver pick the
      // f16 rounding mode, so a texel within one half-float ulp of a bin edge may land one bin over
      // (lavapipe vs SwiftShader differ by ~1 texel in 49k). Everything the bloom threshold
      // consumes has to agree to well inside one bin.
      expect(scan.stats.sampleCount).toBe(256 * 192);
      expect(Math.abs(scan.stats.averageLuma - want.averageLuma)).toBeLessThan(1e-3);
      expect(Math.abs(scan.stats.peakLuma - want.peakLuma)).toBeLessThanOrEqual(binWidth + 1e-9);
      expect(Math.abs(scan.stats.percentileLuma - want.percentileLuma)).toBeLessThanOrEqual(binWidth + 1e-9);
      expect(Math.abs(scan.stats.brightFraction - want.brightFraction)).toBeLessThan(0.005);
    });
  });

  describe('detect_lines (line clear)', () => {
    it.skipIf(!available)('flags exactly the full rows and counts them', () => {
      const run = gpu!.lineClear[0];
      const expectedRows: number[] = [];
      for (let row = 0; row < 20; row++) {
        let full = true;
        for (let col = 0; col < 10; col++) if (run.board[row * 10 + col] === 0) full = false;
        if (full) expectedRows.push(row);
      }
      expect(expectedRows).toEqual([5, 17, 18]);
      expect(rowsFromClearMask(run.mask, 20)).toEqual(expectedRows);
      expect(run.clearedCount).toBe(expectedRows.length);
      expect(Array.from(run.flagsOut), 'one-shot flags are consumed').toEqual(new Array(20).fill(0));
    });

    it.skipIf(!available)('decays dissolve for untouched cells and re-arms cleared rows to 1.0', () => {
      const run = gpu!.lineClear[0];
      const full = new Set([5, 17, 18]);
      for (let i = 0; i < 200; i++) {
        const row = Math.floor(i / 10);
        const col = i % 10;
        const decayed = Math.min(Math.max(run.dissolveIn[i] - run.dt * run.decay, 0), 1);
        if (!full.has(row)) {
          expect(run.dissolveOut[i], `cell ${i}`).toBeCloseTo(decayed, 5);
        } else if (col === 0) {
          expect(run.dissolveOut[i], `row ${row} col 0`).toBe(1);
        } else {
          // Columns 1..9 read `clearFlags[row]` while column 0 writes it, with no barrier: WGSL
          // leaves it unspecified whether they see the re-arm. Either outcome is legal; anything
          // else is a real bug.
          const v = run.dissolveOut[i];
          expect(v === 1 || Math.abs(v - decayed) < 1e-5, `row ${row} col ${col} = ${v}`).toBe(true);
        }
      }
    });

    it.skipIf(!available)('re-arms a row from an external clearFlags entry and consumes the flag', () => {
      const run = gpu!.lineClear[1];
      expect(run.clearedCount).toBe(0);
      expect(run.dissolveOut[3 * 10 + 0]).toBe(1);
      expect(run.flagsOut[3]).toBe(0);
      const decayed = Math.min(Math.max(run.dissolveIn[0] - run.dt * run.decay, 0), 1);
      expect(run.dissolveOut[0]).toBeCloseTo(decayed, 5);
    });
  });

  describe('particle compute', () => {
    const scenarios = particleScenarios().map((s) => s.name);
    it.skipIf(!available).each(scenarios.map((n, i) => [n, i] as const))('matches the CPU physics port: %s', (_n, i) => {
      const run = gpu!.particles[i];
      const expected = cpuParticleStep(run.input, run.uniforms);
      const count = run.input.length / PARTICLE_STRIDE_FLOATS;
      for (let p = 0; p < count; p++) {
        const o = p * PARTICLE_STRIDE_FLOATS;
        if (run.input[o + P.LIFE] <= 0) {
          // Dead particles are skipped entirely: every float, padding included, is untouched.
          expect(Array.from(run.output.subarray(o, o + PARTICLE_STRIDE_FLOATS)), `particle ${p}`)
            .toEqual(Array.from(run.input.subarray(o, o + PARTICLE_STRIDE_FLOATS)));
          continue;
        }
        for (const [name, idx] of Object.entries(P)) {
          if (name === 'R' || name === 'G' || name === 'B' || name === 'A' || name === 'MAX_LIFE') {
            expect(run.output[o + idx], `particle ${p} ${name} must be untouched`).toBe(run.input[o + idx]);
            continue;
          }
          const want = expected[o + idx];
          const got = run.output[o + idx];
          const tol = 2e-3 + 1e-4 * Math.abs(want);
          expect(Math.abs(got - want), `particle ${p} ${name}: gpu ${got} vs cpu ${want}`).toBeLessThanOrEqual(tol);
        }
      }
    });

    it.skipIf(!available)('culls out-of-bounds particles and kills expired ones', () => {
      const out = gpu!.particles[0].output;
      for (const p of [4, 5, 6]) {
        expect(out[p * PARTICLE_STRIDE_FLOATS + P.LIFE], `particle ${p} life`).toBe(-1);
        expect(out[p * PARTICLE_STRIDE_FLOATS + P.SCALE], `particle ${p} scale`).toBe(0);
      }
      // The floor bounce reflected velocity (it was falling at -3 before gravity).
      expect(out[2 * PARTICLE_STRIDE_FLOATS + P.VY]).toBeGreaterThan(0);
    });

    it.skipIf(!available)('floor clamp at y=-43 runs before the y<-60 cull, so that cull can never fire', () => {
      // Particle 3 starts at y=-59.9 falling at -50: the "fell out of the world" test would catch
      // it, but the floor snaps it to -43 first. Documented here so a change to either rule is a
      // deliberate one; the cull is dead code today.
      const out = gpu!.particles[0].output;
      const o = 3 * PARTICLE_STRIDE_FLOATS;
      expect(out[o + P.LIFE]).toBeGreaterThan(0);
      expect(out[o + P.Y]).toBeGreaterThan(-60);
    });
  });
});
