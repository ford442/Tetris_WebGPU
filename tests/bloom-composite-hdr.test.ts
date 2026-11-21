/**
 * The bloom composite is the one place the final tone map lives, so it is where HDR output is
 * a permutation. Three guarantees:
 *   1. The SDR permutation is byte-identical to the pre-HDR shader (sha256 pin).
 *   2. The HDR permutation differs only at the tone map (+ the P3 helpers).
 *   3. Both actually run (Dawn on a software adapter) and match a CPU reference: SDR never
 *      leaves [0, 1]; HDR matches SDR for neutral SDR-range colour, exceeds SDR white for
 *      bright energy, and never exceeds the peak.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CompositeShader, createCompositeShader } from '../src/webgpu/bloomShaders.js';
import { DEFAULT_HDR_PEAK } from '../src/webgpu/bloomSystem.js';
import { acquireDawn, gpuRequired, skipMessage } from './helpers/dawn.js';
import { readRgba16Float, toHalfBits, uploadTexture } from './helpers/gpuIo.js';

/** sha256 of `CompositeShader` as shipped before HDR output existed (1724 chars). */
const PRE_HDR_COMPOSITE_SHA256 = 'ab26f1829158ad5f7e5b3864ace6ffdb91659917a8b2afc26bb136665ba5c8f2';

describe('composite shader permutations', () => {
  it('SDR is byte-identical to the shader that shipped before HDR output', () => {
    expect(CompositeShader).toBe(createCompositeShader());
    expect(CompositeShader).toBe(createCompositeShader({ hdr: false }));
    expect(CompositeShader.length).toBe(1724);
    expect(createHash('sha256').update(CompositeShader).digest('hex')).toBe(PRE_HDR_COMPOSITE_SHA256);
  });

  it('SDR keeps ACES + clamp and has no HDR machinery', () => {
    expect(CompositeShader).toContain('return vec4<f32>(mapped * alpha, alpha);');
    expect(CompositeShader).not.toContain('srgbToDisplayP3');
    expect(CompositeShader).not.toContain('hdrPeak');
  });

  it('HDR shares everything before the tone map and swaps the tail', () => {
    const hdr = createCompositeShader({ hdr: true });
    expect(hdr).not.toBe(CompositeShader);
    expect(hdr).toContain('fn srgbToDisplayP3');
    expect(hdr).toContain('let hdrPeak = params.padding1;');
    expect(hdr).toContain('srgbToDisplayP3(extended) * alpha');
    expect(hdr).not.toContain('mapped');
    // Same entry points and bindings, same Params layout.
    expect(hdr).toContain('fn vsMain');
    expect(hdr).toContain('fn fsMain');
    expect(hdr).toContain('padding1: f32,');
    // The helpers sit before the fragment entry point.
    expect(hdr.indexOf('fn srgbToDisplayP3')).toBeLessThan(hdr.indexOf('@fragment'));
  });
});

// ---------------------------------------------------------------------------------------------
// CPU reference
// ---------------------------------------------------------------------------------------------

const aces = (x: number): number => {
  const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return Math.min(1, Math.max(0, v));
};
const eotf = (x: number): number => {
  const m = Math.abs(x);
  return Math.sign(x) * (m <= 0.04045 ? m / 12.92 : ((m + 0.055) / 1.055) ** 2.4);
};
const oetf = (x: number): number => {
  const m = Math.abs(x);
  return Math.sign(x) * (m <= 0.0031308 ? m * 12.92 : 1.055 * m ** (1 / 2.4) - 0.055);
};
const TO_P3 = [
  [0.8224621, 0.177538, 0.0],
  [0.0331941, 0.9668058, 0.0],
  [0.0170827, 0.0723974, 0.9105199],
] as const;

function cpuComposite(rgb: readonly number[], peak: number, hdr: boolean): number[] {
  const mapped = rgb.map(aces);
  if (!hdr) return mapped;
  const extended = rgb.map((x, i) => mapped[i]! + Math.max(peak - 1, 0) * (1 - Math.exp(-Math.max(x - 1, 0))));
  const lin = extended.map(eotf);
  return TO_P3.map((row) => oetf(row[0] * lin[0]! + row[1] * lin[1]! + row[2] * lin[2]!));
}

describe('composite CPU reference', () => {
  it('HDR equals SDR for neutral SDR-range colour (P3 rows sum to 1)', () => {
    for (const v of [0.05, 0.2, 0.5, 0.9, 1.0]) {
      const sdr = cpuComposite([v, v, v], DEFAULT_HDR_PEAK, false);
      const hdr = cpuComposite([v, v, v], DEFAULT_HDR_PEAK, true);
      for (let i = 0; i < 3; i++) expect(hdr[i]!).toBeCloseTo(sdr[i]!, 5);
    }
  });

  it('exceeds SDR white for bright energy, bounded by the peak', () => {
    const hot = cpuComposite([8, 8, 8], DEFAULT_HDR_PEAK, true);
    expect(hot[0]!).toBeGreaterThan(1.0);
    expect(hot[0]!).toBeLessThanOrEqual(DEFAULT_HDR_PEAK + 1e-6);
  });
});

// ---------------------------------------------------------------------------------------------
// On a real (software) WebGPU adapter
// ---------------------------------------------------------------------------------------------

const dawn = await acquireDawn();
const required = gpuRequired();
if (!dawn.ok && !required) console.warn(skipMessage('bloom-composite-hdr', dawn.reason));

async function runComposite(
  device: GPUDevice,
  code: string,
  rgb: readonly [number, number, number],
  peak: number,
): Promise<number[]> {
  const module = device.createShaderModule({ code });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsMain' },
    fragment: { module, entryPoint: 'fsMain', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });
  const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(params, 0, new Float32Array([1, 65472, peak, 0]));

  const makeSource = (px: readonly number[]): GPUTexture => {
    const tex = device.createTexture({
      size: [1, 1, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    uploadTexture(device, tex, new Uint16Array(px.map(toHalfBits)), 1, 1, 8);
    return tex;
  };
  const original = makeSource([rgb[0], rgb[1], rgb[2], 1]);
  const bloom = makeSource([0, 0, 0, 1]);
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const target = device.createTexture({
    size: [1, 1, 1],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: params } },
      { binding: 1, resource: original.createView() },
      { binding: 2, resource: sampler },
      { binding: 3, resource: bloom.createView() },
      { binding: 4, resource: sampler },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();
  device.queue.submit([encoder.finish()]);
  const out = await readRgba16Float(device, target, 1, 1);
  return [out[0]!, out[1]!, out[2]!];
}

describe.skipIf(!dawn.ok && !required)('composite on a software WebGPU adapter', () => {
  it('has an adapter (required when TETRIS_REQUIRE_GPU=1)', () => {
    if (!dawn.ok) throw new Error(`TETRIS_REQUIRE_GPU=1 but no adapter: ${dawn.reason}`);
  });

  const cases: Array<[string, [number, number, number]]> = [
    ['black', [0, 0, 0]],
    ['dim neutral', [0.2, 0.2, 0.2]],
    ['mid neutral', [0.5, 0.5, 0.5]],
    ['SDR white', [1, 1, 1]],
    ['saturated gold', [2.4, 1.6, 0.3]],
    ['hot specular', [10, 10, 10]],
  ];

  it.skipIf(!dawn.ok).each(cases)('SDR permutation matches ACES and stays in [0, 1]: %s', async (_n, rgb) => {
    if (!dawn.ok) return;
    const got = await runComposite(dawn.gpu.device, CompositeShader, rgb, 0);
    const want = cpuComposite(rgb, 0, false);
    for (let i = 0; i < 3; i++) {
      expect(got[i]!).toBeCloseTo(want[i]!, 2);
      expect(got[i]!).toBeLessThanOrEqual(1.001);
    }
  });

  it.skipIf(!dawn.ok).each(cases)('HDR permutation matches the CPU reference: %s', async (_n, rgb) => {
    if (!dawn.ok) return;
    const got = await runComposite(dawn.gpu.device, createCompositeShader({ hdr: true }), rgb, DEFAULT_HDR_PEAK);
    const want = cpuComposite(rgb, DEFAULT_HDR_PEAK, true);
    for (let i = 0; i < 3; i++) {
      expect(got[i]!).toBeCloseTo(want[i]!, 2);
      expect(got[i]!).toBeLessThanOrEqual(DEFAULT_HDR_PEAK + 0.01);
    }
  });

  it.skipIf(!dawn.ok)('HDR highlights exceed SDR white; SDR-range neutrals do not move', async () => {
    if (!dawn.ok) return;
    const hdrCode = createCompositeShader({ hdr: true });
    const hot = await runComposite(dawn.gpu.device, hdrCode, [10, 10, 10], DEFAULT_HDR_PEAK);
    expect(Math.min(...hot)).toBeGreaterThan(1.0);
    const mid = await runComposite(dawn.gpu.device, hdrCode, [0.5, 0.5, 0.5], DEFAULT_HDR_PEAK);
    const sdrMid = await runComposite(dawn.gpu.device, CompositeShader, [0.5, 0.5, 0.5], 0);
    for (let i = 0; i < 3; i++) expect(mid[i]!).toBeCloseTo(sdrMid[i]!, 2);
  });
});
