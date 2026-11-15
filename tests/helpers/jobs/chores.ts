/**
 * The GPU half of the chores parity suite: one sequential pass over every kernel, returning raw
 * GPU outputs. `tests/gpu-chores-dawn.test.ts` runs it once at module scope and asserts on the
 * result against the CPU references in `choresFixtures.ts`.
 */

import { LineClearComputeShader, LINE_CLEAR_RESULTS_BYTE_SIZE, ParticleComputeShader } from '../../../src/webgpu/compute.js';
import { GpuChoreRunner } from '../../../src/webgpu/gpuChores/runner.js';
import { LUMA_HISTOGRAM_BINS, LUMA_HISTOGRAM_MAX } from '../../../src/webgpu/gpuChores/lumaStats.js';
import { Downsample2dShader, LumaHistogramShader } from '../../../src/webgpu/gpuChores/shaders.js';
import { PARTICLE_STRIDE_BYTES, PARTICLE_STRIDE_FLOATS } from '../../../src/webgpu/particles/layout.js';
import { readBuffer } from '../dawn.js';
import {
  DOWNSAMPLE_CASES,
  FRAME,
  HDR,
  LUMA_CASES,
  flagSets,
  mulberry32,
  particleScenarios,
  type GpuResults,
  type LineClearRun,
} from '../choresFixtures.js';
import { createTexture2d, readRgba16Float, uploadTexture } from '../gpuIo.js';

const WORKGROUP_2D = 8;
const tiles = (n: number, size: number): number => Math.ceil(n / size);

export async function run(device: GPUDevice): Promise<GpuResults> {
  const results: GpuResults = {
    lumaRgba8: [], lumaHdr: new Uint32Array(), downsample: [], compact: [], scan: null, lineClear: [], particles: [],
  };

  // --- luma_histogram, direct ---------------------------------------------------------
  const lumaPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: LumaHistogramShader }), entryPoint: 'luma_histogram' },
  });
  const runLuma = async (texture: GPUTexture, w: number, h: number): Promise<Uint32Array> => {
    const histogram = device.createBuffer({
      size: LUMA_HISTOGRAM_BINS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const uniforms = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const ub = new ArrayBuffer(16);
    new Uint32Array(ub, 0, 2).set([w, h]);
    new Float32Array(ub, 8, 1)[0] = LUMA_HISTOGRAM_MAX;
    device.queue.writeBuffer(uniforms, 0, ub);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(lumaPipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: lumaPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: { buffer: histogram } },
        { binding: 2, resource: { buffer: uniforms } },
      ],
    }));
    pass.dispatchWorkgroups(tiles(w, WORKGROUP_2D), tiles(h, WORKGROUP_2D));
    pass.end();
    device.queue.submit([enc.finish()]);
    return new Uint32Array(await readBuffer(device, histogram, LUMA_HISTOGRAM_BINS * 4));
  };

  for (const c of LUMA_CASES) {
    const tex = createTexture2d(device, c.width, c.height, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    uploadTexture(device, tex, c.data, c.width, c.height, 4);
    results.lumaRgba8.push(await runLuma(tex, c.width, c.height));
  }
  const hdrTex = createTexture2d(device, HDR.width, HDR.height, 'rgba16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
  uploadTexture(device, hdrTex, HDR.halves, HDR.width, HDR.height, 8);
  results.lumaHdr = await runLuma(hdrTex, HDR.width, HDR.height);

  // --- downsample_2d, direct ---------------------------------------------------------
  const downPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: Downsample2dShader }), entryPoint: 'downsample_2d' },
  });
  for (const c of DOWNSAMPLE_CASES) {
    const src = createTexture2d(device, c.src.width, c.src.height, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    uploadTexture(device, src, c.src.data, c.src.width, c.src.height, 4);
    const dst = createTexture2d(device, c.dw, c.dh, 'rgba16float', GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC);
    const uniforms = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniforms, 0, new Uint32Array([c.src.width, c.src.height, c.dw, c.dh]));
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(downPipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: downPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: src.createView() },
        { binding: 1, resource: dst.createView() },
        { binding: 2, resource: { buffer: uniforms } },
      ],
    }));
    pass.dispatchWorkgroups(tiles(c.dw, WORKGROUP_2D), tiles(c.dh, WORKGROUP_2D));
    pass.end();
    device.queue.submit([enc.finish()]);
    results.downsample.push(await readRgba16Float(device, dst, c.dw, c.dh));
  }

  // --- GpuChoreRunner: compact_indices (GPU rung) ------------------------------------
  const runner = GpuChoreRunner.create({
    device,
    policy: { backend: 'webgpu', reason: 'dawn-test' },
    scanIntervalFrames: 1,
  });
  for (const set of flagSets()) {
    const gpu = await runner.compactIndicesOnGpu(set.flags, set.maxOut ?? set.flags.length);
    results.compact.push({ gpu, stillOnGpu: runner.backend === 'webgpu' });
  }

  // --- GpuChoreRunner: luma scan end to end -------------------------------------------
  const frameTex = createTexture2d(device, FRAME.width, FRAME.height, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
  uploadTexture(device, frameTex, FRAME.data, FRAME.width, FRAME.height, 4);
  const enc = device.createCommandEncoder();
  const encoded = runner.encodeLumaScan(enc, frameTex.createView(), FRAME.width, FRAME.height);
  device.queue.submit([enc.finish()]);
  runner.afterSubmit();
  if (encoded) {
    const deadline = Date.now() + 10_000;
    while (runner.status().readbacks < 1 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
  }
  const status = runner.status();
  results.scan = { stats: status.stats, backend: status.backend, readbacks: status.readbacks, scans: status.scans };

  // --- line clear compute --------------------------------------------------------------
  const lcPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: LineClearComputeShader }), entryPoint: 'detect_lines' },
  });
  const runLineClear = async (board: Uint32Array, flagsIn: Uint32Array, dissolveIn: Float32Array, dt: number, decay: number): Promise<LineClearRun> => {
    const mk = (size: number, usage: number): GPUBuffer => device.createBuffer({ size, usage });
    const rw = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const boardBuf = mk(200 * 4, rw);
    const dissolveBuf = mk(200 * 4, rw);
    const flagsBuf = mk(20 * 4, rw);
    const resultsBuf = mk(LINE_CLEAR_RESULTS_BYTE_SIZE, rw);
    const uniformBuf = mk(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(boardBuf, 0, board);
    device.queue.writeBuffer(dissolveBuf, 0, dissolveIn);
    device.queue.writeBuffer(flagsBuf, 0, flagsIn);
    device.queue.writeBuffer(uniformBuf, 0, new Float32Array([dt, decay, 0, 0]));
    const e = device.createCommandEncoder();
    const pass = e.beginComputePass();
    pass.setPipeline(lcPipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: lcPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: boardBuf } },
        { binding: 1, resource: { buffer: dissolveBuf } },
        { binding: 2, resource: { buffer: flagsBuf } },
        { binding: 3, resource: { buffer: resultsBuf } },
        { binding: 4, resource: { buffer: uniformBuf } },
      ],
    }));
    pass.dispatchWorkgroups(tiles(200, 64));
    pass.end();
    device.queue.submit([e.finish()]);
    const res = new Uint32Array(await readBuffer(device, resultsBuf, LINE_CLEAR_RESULTS_BYTE_SIZE));
    return {
      board, dissolveIn, flagsIn, dt, decay,
      dissolveOut: new Float32Array(await readBuffer(device, dissolveBuf, 200 * 4)),
      flagsOut: new Uint32Array(await readBuffer(device, flagsBuf, 20 * 4)),
      clearedCount: res[0],
      mask: res.slice(1, 21),
    };
  };
  const rnd = mulberry32(5);
  const lcBoard = new Uint32Array(200);
  for (const row of [5, 17, 18]) lcBoard.fill(1, row * 10, row * 10 + 10); // full rows
  lcBoard.fill(2, 10 * 10, 10 * 10 + 9); // row 10: 9 of 10 cells -> not full
  lcBoard[3 * 10 + 4] = 3; // a stray cell
  const dissolve = Float32Array.from({ length: 200 }, () => rnd());
  results.lineClear.push(await runLineClear(lcBoard, new Uint32Array(20), dissolve, 1 / 60, 2));
  const externalFlags = new Uint32Array(20);
  externalFlags[3] = 1; // re-arm a row the board says is not full
  results.lineClear.push(await runLineClear(new Uint32Array(200), externalFlags, dissolve, 1 / 30, 1.5));

  // --- particle compute ---------------------------------------------------------------
  const pPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: ParticleComputeShader }), entryPoint: 'main' },
  });
  for (const fx of particleScenarios()) {
    const count = fx.input.length / PARTICLE_STRIDE_FLOATS;
    const pBuf = device.createBuffer({
      size: count * PARTICLE_STRIDE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const uBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(pBuf, 0, fx.input);
    const u = fx.uniforms;
    device.queue.writeBuffer(uBuf, 0, new Float32Array([
      u.dt, u.time, u.shockwaveTimer, 0,
      u.center[0], u.center[1], 0, 0,
      u.params[0], u.params[1], u.params[2], u.params[3],
    ]));
    const e = device.createCommandEncoder();
    const pass = e.beginComputePass();
    pass.setPipeline(pPipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: pPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: pBuf } },
        { binding: 1, resource: { buffer: uBuf } },
      ],
    }));
    pass.dispatchWorkgroups(tiles(count, 64));
    pass.end();
    device.queue.submit([e.finish()]);
    results.particles.push({
      name: fx.name,
      input: fx.input,
      uniforms: fx.uniforms,
      output: new Float32Array(await readBuffer(device, pBuf, count * PARTICLE_STRIDE_BYTES)),
    });
  }

  runner.destroy();
  return results;
}

