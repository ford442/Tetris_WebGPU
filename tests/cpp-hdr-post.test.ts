/**
 * The C++ renderer's post pass, HDR branch — the real WGSL (shared hdrOutput.wgsl + the C++ post
 * shader, composed the way `create_post_pipeline()` does) executed on a software adapter.
 * `hdrPeak == 0` must leave the SDR output untouched; `> 0` must keep the SDR range, exceed SDR
 * white for bright energy, and stay under the peak.
 */
import { describe, expect, it } from 'vitest';
import { buildShaderCatalog } from './helpers/shaderCatalog.js';
import { acquireDawn, gpuRequired, skipMessage } from './helpers/dawn.js';
import { readRgba16Float, toHalfBits, uploadTexture } from './helpers/gpuIo.js';
import {
  DEFAULT_HDR_PEAK,
  presentationFromCppState,
  resolveHdrIntent,
  shouldRequestHdr,
} from '../src/webgpu/presentation.js';

const dawn = await acquireDawn();
const required = gpuRequired();
if (!dawn.ok && !required) console.warn(skipMessage('cpp-hdr-post', dawn.reason));

async function runPost(device: GPUDevice, premult: readonly [number, number, number, number], peak: number): Promise<number[]> {
  const code = buildShaderCatalog().find((e) => e.id === 'cpp/postprocess')!.code;
  const module = device.createShaderModule({ code });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });
  // time, intensity, aberration, hdrPeak — intensity/aberration 0 so only the HDR branch differs.
  const uniforms = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(uniforms, 0, new Float32Array([0, 0, 0, peak]));
  const source = device.createTexture({
    size: [1, 1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  uploadTexture(device, source, new Uint16Array(premult.map(toHalfBits)), 1, 1, 8);
  const target = device.createTexture({
    size: [1, 1, 1], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniforms } },
      { binding: 1, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
      { binding: 2, resource: source.createView() },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
  const out = await readRgba16Float(device, target, 1, 1);
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}

describe.skipIf(!dawn.ok && !required)('C++ post pass — HDR branch on a software WebGPU adapter', () => {
  it('has an adapter (required when TETRIS_REQUIRE_GPU=1)', () => {
    if (!dawn.ok) throw new Error(`TETRIS_REQUIRE_GPU=1 but no adapter: ${dawn.reason}`);
  });

  it.skipIf(!dawn.ok)('hdrPeak 0 is the unchanged SDR pass-through (even for values > 1)', async () => {
    if (!dawn.ok) return;
    const out = await runPost(dawn.gpu.device, [0.5, 0.5, 0.5, 1], 0);
    for (let i = 0; i < 3; i++) expect(out[i]!).toBeCloseTo(0.5, 2);
    const hot = await runPost(dawn.gpu.device, [3, 3, 3, 1], 0);
    for (let i = 0; i < 3; i++) expect(hot[i]!).toBeCloseTo(3, 1);
  });

  it.skipIf(!dawn.ok)('HDR keeps the SDR range for neutral colour', async () => {
    if (!dawn.ok) return;
    for (const v of [0.1, 0.5, 0.9]) {
      const out = await runPost(dawn.gpu.device, [v, v, v, 1], DEFAULT_HDR_PEAK);
      for (let i = 0; i < 3; i++) expect(out[i]!).toBeCloseTo(v, 2);
    }
  });

  it.skipIf(!dawn.ok)('HDR exceeds SDR white for bright energy, bounded by the peak', async () => {
    if (!dawn.ok) return;
    const out = await runPost(dawn.gpu.device, [6, 6, 6, 1], DEFAULT_HDR_PEAK);
    for (let i = 0; i < 3; i++) {
      expect(out[i]!).toBeGreaterThan(1.0);
      expect(out[i]!).toBeLessThanOrEqual(DEFAULT_HDR_PEAK + 0.01);
    }
  });

  it.skipIf(!dawn.ok)('re-premultiplies: half-covered neutral stays half as bright', async () => {
    if (!dawn.ok) return;
    const out = await runPost(dawn.gpu.device, [0.25, 0.25, 0.25, 0.5], DEFAULT_HDR_PEAK);
    for (let i = 0; i < 3; i++) expect(out[i]!).toBeCloseTo(0.25, 2);
    expect(out[3]!).toBeCloseTo(0.5, 2);
  });
});

describe('presentationFromCppState', () => {
  const sdr = 'bgra8unorm' as const;
  const on = resolveHdrIntent('', true);
  const off = resolveHdrIntent('', false);
  const forced = resolveHdrIntent('?hdr=1', false);

  it('asks C++ for HDR only when requested and (forced or the display reports HDR)', () => {
    expect(shouldRequestHdr(on, true)).toBe(true);
    expect(shouldRequestHdr(on, false)).toBe(false);
    expect(shouldRequestHdr(forced, false)).toBe(true);
    expect(shouldRequestHdr(off, true)).toBe(false);
  });

  it('reports an active HDR surface', () => {
    expect(presentationFromCppState({ intent: on, displayHdr: true, surfaceState: 1, sdrFormat: sdr })).toMatchObject({
      hdr: true, format: 'rgba16float', colorSpace: 'display-p3', toneMapping: 'extended', hdrStatus: 'active',
    });
  });

  it('reports SDR with the reason when not requested / no display / rejected', () => {
    expect(presentationFromCppState({ intent: off, displayHdr: true, surfaceState: 0, sdrFormat: sdr })).toMatchObject({
      hdr: false, format: sdr, hdrStatus: 'off',
    });
    expect(presentationFromCppState({ intent: on, displayHdr: false, surfaceState: 0, sdrFormat: sdr }).hdrStatus).toBe('no-hdr-display');
    expect(presentationFromCppState({ intent: on, displayHdr: true, surfaceState: 2, sdrFormat: sdr })).toMatchObject({
      hdr: false, format: sdr, hdrStatus: 'tone-mapping-unsupported',
    });
  });

  it('never claims HDR if C++ says active but TS did not ask', () => {
    expect(presentationFromCppState({ intent: off, displayHdr: true, surfaceState: 1, sdrFormat: sdr }).hdr).toBe(false);
  });
});
