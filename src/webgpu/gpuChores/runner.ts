/**
 * GpuChoreRunner — post/juice helpers on the renderer's own GPU device.
 *
 * Contract, in order of importance:
 *
 *  1. It **adopts** a device, it never requests one. The active renderer (TS
 *     WebGPU *or* the Emscripten C++ renderer, never both) owns the device;
 *     the runner takes the one in `gpuChores/deviceRegistry` and nothing else.
 *  2. It touches no board state. Inputs are a rendered texture and a flag
 *     buffer; outputs are a handful of floats and an index list.
 *  3. It fails soft. Every GPU call is guarded: the first failure disables the
 *     GPU rung for the session, drops a breadcrumb, and leaves the caller on
 *     the CPU rung with the static tuning. The board never notices.
 *  4. It never stalls the frame. The histogram is read back through a
 *     non-blocking `mapAsync` with at most one map in flight; a frame whose
 *     readback has not landed simply reuses the previous stats.
 */

import {
  CompactIndicesShader,
  Downsample2dShader,
  LumaHistogramShader,
  CHORE_WORKGROUP_1D,
  CHORE_WORKGROUP_2D,
  LUMA_HISTOGRAM_BINS,
} from './shaders.js';
import {
  EMPTY_LUMA_STATS,
  histogramToStats,
  LUMA_HISTOGRAM_MAX,
  type LumaStats,
} from './lumaStats.js';
import { compactIndicesCpu } from './compact.js';
import { recordChoreBreadcrumb, choreLogger } from './breadcrumbs.js';
import { resolveChorePolicy, readKillSwitchStorage, type ChoreBackend, type ChorePolicy } from './policy.js';
import { activeGpuDevice } from './deviceRegistry.js';
import { BufferUsage, MapMode, TextureUsage } from './gpuFlags.js';

/** Bytes of histogram readback — 64 bins, and that is the whole transfer. */
const HISTOGRAM_BYTES = LUMA_HISTOGRAM_BINS * 4;

/** Frames between luma scans. The threshold moves slowly; sampling every frame is waste. */
export const DEFAULT_SCAN_INTERVAL_FRAMES = 4;

/** Longest edge of the downsampled scan target. */
export const DEFAULT_SCAN_MAX_EDGE = 256;

export interface GpuChoreRunnerOptions {
  /** Device to adopt. Defaults to the session's registered device. */
  device?: GPUDevice | null;
  /** Pre-resolved policy; resolved from URL/renderer/quality when omitted. */
  policy?: ChorePolicy;
  rendererName?: string;
  powerPreference?: GPUPowerPreference | string;
  quality?: string;
  scanIntervalFrames?: number;
  scanMaxEdge?: number;
}

export interface ChoreStatus {
  backend: ChoreBackend;
  reason: string;
  enabled: boolean;
  scans: number;
  readbacks: number;
  stats: LumaStats;
}

export class GpuChoreRunner {
  private readonly device: GPUDevice | null;
  private readonly policy: ChorePolicy;
  private readonly scanInterval: number;
  private readonly scanMaxEdge: number;

  private gpuEnabled: boolean;
  private frame = 0;
  private scans = 0;
  private readbacks = 0;
  private readbackPending = false;
  private copyEncodedThisFrame = false;

  private lumaPipeline: GPUComputePipeline | null = null;
  private downsamplePipeline: GPUComputePipeline | null = null;
  private compactPipeline: GPUComputePipeline | null = null;

  private histogramBuffer: GPUBuffer | null = null;
  private readbackBuffer: GPUBuffer | null = null;
  private lumaUniformBuffer: GPUBuffer | null = null;
  private downsampleUniformBuffer: GPUBuffer | null = null;

  private scanTexture: GPUTexture | null = null;
  private scanView: GPUTextureView | null = null;
  private scanWidth = 0;
  private scanHeight = 0;
  private sourceWidth = 0;
  private sourceHeight = 0;

  private latest: LumaStats = { ...EMPTY_LUMA_STATS };

  private constructor(device: GPUDevice | null, policy: ChorePolicy, options: GpuChoreRunnerOptions) {
    this.device = device;
    this.policy = policy;
    this.scanInterval = Math.max(1, Math.floor(options.scanIntervalFrames ?? DEFAULT_SCAN_INTERVAL_FRAMES));
    this.scanMaxEdge = Math.max(32, Math.floor(options.scanMaxEdge ?? DEFAULT_SCAN_MAX_EDGE));
    this.gpuEnabled = policy.backend === 'webgpu' && !!device;
  }

  /**
   * Build a runner for the active renderer. Always returns a runner: with the
   * kill switch on, no device, or a non-WebGPU renderer it is simply one that
   * runs its jobs on the CPU rung.
   */
  static create(options: GpuChoreRunnerOptions = {}): GpuChoreRunner {
    const device = options.device === undefined ? (activeGpuDevice() as GPUDevice | null) : options.device;
    const policy = options.policy ?? resolveChorePolicy({
      storageValue: readKillSwitchStorage(),
      rendererName: options.rendererName,
      hasDevice: !!device,
      powerPreference: options.powerPreference,
      quality: options.quality,
    });
    recordChoreBreadcrumb('chores:created', `${policy.backend} (${policy.reason})`);
    return new GpuChoreRunner(device ?? null, policy, options);
  }

  get backend(): ChoreBackend {
    return this.gpuEnabled ? 'webgpu' : 'cpu';
  }

  /** Most recent measured stats; all-zero until the first readback lands. */
  get stats(): LumaStats {
    return this.latest;
  }

  status(): ChoreStatus {
    return {
      backend: this.backend,
      reason: this.policy.reason,
      enabled: this.gpuEnabled,
      scans: this.scans,
      readbacks: this.readbacks,
      stats: this.latest,
    };
  }

  /**
   * Encode `downsample_2d` + `luma_histogram` over the composited frame into an
   * encoder the renderer is already building — no second submit, no second
   * queue. Returns true when work was actually encoded this frame.
   *
   * Safe to call every frame: it self-throttles and no-ops while a readback is
   * still in flight.
   */
  encodeLumaScan(
    encoder: GPUCommandEncoder,
    sourceView: GPUTextureView,
    width: number,
    height: number,
  ): boolean {
    this.copyEncodedThisFrame = false;
    if (!this.gpuEnabled || !this.device || !encoder || !sourceView) return false;
    if (width <= 0 || height <= 0) return false;

    this.frame += 1;
    if (this.frame % this.scanInterval !== 0) return false;
    if (this.readbackPending) return false;

    try {
      this.ensureLumaResources(width, height);
      if (!this.scanView || !this.histogramBuffer || !this.readbackBuffer) return false;

      encoder.clearBuffer(this.histogramBuffer, 0, HISTOGRAM_BYTES);

      // 1. Reduce: full-res frame -> quarter-ish scan target.
      const downPass = encoder.beginComputePass({ label: 'chore:downsample_2d' });
      downPass.setPipeline(this.downsamplePipeline!);
      downPass.setBindGroup(0, this.device.createBindGroup({
        label: 'chore:downsample_2d:bg',
        layout: this.downsamplePipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sourceView },
          { binding: 1, resource: this.scanView },
          { binding: 2, resource: { buffer: this.downsampleUniformBuffer! } },
        ],
      }));
      downPass.dispatchWorkgroups(
        tiles(this.scanWidth, CHORE_WORKGROUP_2D),
        tiles(this.scanHeight, CHORE_WORKGROUP_2D),
      );
      downPass.end();

      // 2. Measure: histogram of the reduced frame.
      const histPass = encoder.beginComputePass({ label: 'chore:luma_histogram' });
      histPass.setPipeline(this.lumaPipeline!);
      histPass.setBindGroup(0, this.device.createBindGroup({
        label: 'chore:luma_histogram:bg',
        layout: this.lumaPipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.scanView },
          { binding: 1, resource: { buffer: this.histogramBuffer } },
          { binding: 2, resource: { buffer: this.lumaUniformBuffer! } },
        ],
      }));
      histPass.dispatchWorkgroups(
        tiles(this.scanWidth, CHORE_WORKGROUP_2D),
        tiles(this.scanHeight, CHORE_WORKGROUP_2D),
      );
      histPass.end();

      encoder.copyBufferToBuffer(this.histogramBuffer, 0, this.readbackBuffer, 0, HISTOGRAM_BYTES);
      this.copyEncodedThisFrame = true;
      this.scans += 1;
      return true;
    } catch (err) {
      this.disableGpu('luma:encode-failed', err);
      return false;
    }
  }

  /**
   * Kick the non-blocking readback for the scan encoded this frame. Call once
   * after `queue.submit()`; it returns immediately and the stats appear a frame
   * or two later.
   */
  afterSubmit(): void {
    if (!this.copyEncodedThisFrame || !this.readbackBuffer) return;
    this.copyEncodedThisFrame = false;
    this.readbackPending = true;

    const buffer = this.readbackBuffer;
    let mapping: Promise<void>;
    try {
      mapping = buffer.mapAsync(MapMode.READ, 0, HISTOGRAM_BYTES);
    } catch (err) {
      this.readbackPending = false;
      this.disableGpu('luma:map-failed', err);
      return;
    }

    void mapping.then(
      () => {
        try {
          const bins = new Uint32Array(buffer.getMappedRange(0, HISTOGRAM_BYTES).slice(0));
          buffer.unmap();
          this.latest = histogramToStats(bins);
          this.readbacks += 1;
          if (this.readbacks === 1) {
            recordChoreBreadcrumb('luma:first-readback', `avg=${this.latest.averageLuma.toFixed(3)}`);
          }
        } catch (err) {
          this.disableGpu('luma:readback-failed', err);
        } finally {
          this.readbackPending = false;
        }
      },
      (err: unknown) => {
        this.readbackPending = false;
        // A map rejection during device loss is expected; treat it as the end
        // of the GPU rung rather than an error worth surfacing to the player.
        this.disableGpu('luma:map-rejected', err);
      },
    );
  }

  /**
   * `compact_indices` on the CPU rung.
   *
   * The line-clear burst needs its indices in the same frame the rows clear, and
   * a GPU compaction would have to be read back — one or two frames of latency
   * for a 200-element list. So the wired path is the CPU rung, and
   * {@link compactIndicesOnGpu} exists for callers that can take the deferral.
   * Both rungs are pinned to the same ascending output by
   * `tests/gpu-chores-compact.test.ts`.
   */
  compactIndices(flags: ArrayLike<number>, maxOut = flags.length): Uint32Array {
    return compactIndicesCpu(flags, maxOut);
  }

  /**
   * `compact_indices` on the GPU rung, for a caller that can wait for the
   * result (it costs a readback). Falls back to the CPU rung on any failure, so
   * the returned promise always resolves with a usable list.
   */
  async compactIndicesOnGpu(flags: ArrayLike<number>, maxOut = flags.length): Promise<Uint32Array> {
    const limit = Math.max(0, Math.min(maxOut, flags.length));
    if (!this.gpuEnabled || !this.device || limit === 0) return compactIndicesCpu(flags, maxOut);

    let flagBuffer: GPUBuffer | null = null;
    let indexBuffer: GPUBuffer | null = null;
    let totalBuffer: GPUBuffer | null = null;
    let uniformBuffer: GPUBuffer | null = null;
    let readBuffer: GPUBuffer | null = null;
    try {
      const pipeline = this.ensureCompactPipeline();
      const device = this.device;
      const flagData = Uint32Array.from(flags, (v) => (v ? 1 : 0));
      const indexBytes = Math.max(4, limit * 4);

      flagBuffer = device.createBuffer({
        label: 'chore:compact:flags',
        size: Math.max(4, flagData.byteLength),
        usage: BufferUsage.STORAGE | BufferUsage.COPY_DST,
      });
      indexBuffer = device.createBuffer({
        label: 'chore:compact:indices',
        size: indexBytes,
        usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC,
      });
      totalBuffer = device.createBuffer({
        label: 'chore:compact:total',
        size: 4,
        usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC | BufferUsage.COPY_DST,
      });
      uniformBuffer = device.createBuffer({
        label: 'chore:compact:uniforms',
        size: 16,
        usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST,
      });
      readBuffer = device.createBuffer({
        label: 'chore:compact:readback',
        size: indexBytes + 4,
        usage: BufferUsage.MAP_READ | BufferUsage.COPY_DST,
      });

      device.queue.writeBuffer(flagBuffer, 0, flagData);
      device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([flagData.length, limit, 0, 0]));

      const encoder = device.createCommandEncoder({ label: 'chore:compact_indices' });
      encoder.clearBuffer(totalBuffer, 0, 4);
      const pass = encoder.beginComputePass({ label: 'chore:compact_indices:pass' });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: flagBuffer } },
          { binding: 1, resource: { buffer: indexBuffer } },
          { binding: 2, resource: { buffer: totalBuffer } },
          { binding: 3, resource: { buffer: uniformBuffer } },
        ],
      }));
      pass.dispatchWorkgroups(tiles(flagData.length, CHORE_WORKGROUP_1D));
      pass.end();
      encoder.copyBufferToBuffer(indexBuffer, 0, readBuffer, 0, indexBytes);
      encoder.copyBufferToBuffer(totalBuffer, 0, readBuffer, indexBytes, 4);
      device.queue.submit([encoder.finish()]);

      await readBuffer.mapAsync(MapMode.READ);
      const mapped = new Uint32Array(readBuffer.getMappedRange().slice(0));
      readBuffer.unmap();
      const produced = Math.min(mapped[mapped.length - 1], limit);
      return mapped.slice(0, produced);
    } catch (err) {
      this.disableGpu('compact:failed', err);
      return compactIndicesCpu(flags, maxOut);
    } finally {
      destroyAll([flagBuffer, indexBuffer, totalBuffer, uniformBuffer, readBuffer]);
    }
  }

  /** Release GPU resources. The device itself belongs to the renderer. */
  destroy(): void {
    this.gpuEnabled = false;
    destroyAll([
      this.histogramBuffer,
      this.readbackBuffer,
      this.lumaUniformBuffer,
      this.downsampleUniformBuffer,
    ]);
    try {
      this.scanTexture?.destroy();
    } catch { /* already gone */ }
    this.histogramBuffer = null;
    this.readbackBuffer = null;
    this.lumaUniformBuffer = null;
    this.downsampleUniformBuffer = null;
    this.scanTexture = null;
    this.scanView = null;
    recordChoreBreadcrumb('chores:destroyed');
  }

  // --------------------------------------------------------------------------

  private ensureLumaResources(width: number, height: number): void {
    const device = this.device!;
    if (!this.lumaPipeline) {
      this.lumaPipeline = device.createComputePipeline({
        label: 'chore:luma_histogram',
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ label: 'chore:luma_histogram:wgsl', code: LumaHistogramShader }),
          entryPoint: 'luma_histogram',
        },
      });
      this.downsamplePipeline = device.createComputePipeline({
        label: 'chore:downsample_2d',
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ label: 'chore:downsample_2d:wgsl', code: Downsample2dShader }),
          entryPoint: 'downsample_2d',
        },
      });
      this.histogramBuffer = device.createBuffer({
        label: 'chore:histogram',
        size: HISTOGRAM_BYTES,
        usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC | BufferUsage.COPY_DST,
      });
      this.readbackBuffer = device.createBuffer({
        label: 'chore:histogram:readback',
        size: HISTOGRAM_BYTES,
        usage: BufferUsage.MAP_READ | BufferUsage.COPY_DST,
      });
      this.lumaUniformBuffer = device.createBuffer({
        label: 'chore:luma:uniforms',
        size: 16,
        usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST,
      });
      this.downsampleUniformBuffer = device.createBuffer({
        label: 'chore:downsample:uniforms',
        size: 16,
        usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST,
      });
      recordChoreBreadcrumb('luma:pipelines-ready');
    }

    if (width === this.sourceWidth && height === this.sourceHeight && this.scanView) return;

    const scale = Math.max(1, Math.ceil(Math.max(width, height) / this.scanMaxEdge));
    const scanWidth = Math.max(1, Math.floor(width / scale));
    const scanHeight = Math.max(1, Math.floor(height / scale));

    try {
      this.scanTexture?.destroy();
    } catch { /* already gone */ }
    this.scanTexture = device.createTexture({
      label: 'chore:scan-target',
      size: [scanWidth, scanHeight, 1],
      format: 'rgba16float',
      usage: TextureUsage.STORAGE_BINDING | TextureUsage.TEXTURE_BINDING,
    });
    this.scanView = this.scanTexture.createView();
    this.scanWidth = scanWidth;
    this.scanHeight = scanHeight;
    this.sourceWidth = width;
    this.sourceHeight = height;

    device.queue.writeBuffer(
      this.downsampleUniformBuffer!,
      0,
      new Uint32Array([width, height, scanWidth, scanHeight]),
    );
    // srcSize (2 x u32) then maxLuma (f32) — written as one 16-byte block.
    const lumaUniforms = new ArrayBuffer(16);
    new Uint32Array(lumaUniforms, 0, 2).set([scanWidth, scanHeight]);
    new Float32Array(lumaUniforms, 8, 1)[0] = LUMA_HISTOGRAM_MAX;
    device.queue.writeBuffer(this.lumaUniformBuffer!, 0, lumaUniforms);

    recordChoreBreadcrumb('luma:resized', `${width}x${height} -> ${scanWidth}x${scanHeight}`);
  }

  private ensureCompactPipeline(): GPUComputePipeline {
    if (!this.compactPipeline) {
      this.compactPipeline = this.device!.createComputePipeline({
        label: 'chore:compact_indices',
        layout: 'auto',
        compute: {
          module: this.device!.createShaderModule({
            label: 'chore:compact_indices:wgsl',
            code: CompactIndicesShader,
          }),
          entryPoint: 'compact_indices',
        },
      });
    }
    return this.compactPipeline;
  }

  /**
   * Retire the GPU rung for the rest of the session. Callers keep working on
   * the CPU rung with the static tuning — the juice degrades, nothing breaks.
   */
  private disableGpu(event: string, err?: unknown): void {
    if (!this.gpuEnabled) return;
    this.gpuEnabled = false;
    const detail = err instanceof Error ? err.message : err ? String(err) : undefined;
    recordChoreBreadcrumb(event, detail);
    choreLogger.warn(`GPU chore rung disabled (${event}):`, detail ?? '');
    this.latest = { ...EMPTY_LUMA_STATS };
  }
}

function tiles(extent: number, workgroup: number): number {
  return Math.max(1, Math.ceil(extent / workgroup));
}

function destroyAll(buffers: Array<{ destroy?: () => void } | null>): void {
  for (const buffer of buffers) {
    try {
      buffer?.destroy?.();
    } catch { /* already gone */ }
  }
}
