/**
 * WebGPU timestamp-query pass timers. No-ops cleanly when `timestamp-query` is absent.
 *
 * Each tracked region uses a start/end query pair. Results are resolved asynchronously
 * (one frame behind) so the render loop never stalls on readback.
 */

export const PASS_TIMER_REGIONS = [
  'particleCompute',
  'dissolveCompute',
  'mainBlocks',
  'particleDraw',
  'postProcess',
  'bloom',
] as const;

export type PassTimerRegion = (typeof PASS_TIMER_REGIONS)[number];

export interface PassTimerSnapshot {
  enabled: boolean;
  frameMs: number;
  /** Per-region GPU time in milliseconds (0 when unavailable). */
  regions: Record<PassTimerRegion, number>;
}

const REGION_COUNT = PASS_TIMER_REGIONS.length;
const QUERY_COUNT = REGION_COUNT * 2;
const RESOLVE_BYTE_SIZE = 256; // WebGPU minimum alignment for resolveQuerySet

type TimestampEncoder = {
  writeTimestamp(querySet: GPUQuerySet, queryIndex: number): void;
};

function regionIndex(region: PassTimerRegion): number {
  return PASS_TIMER_REGIONS.indexOf(region);
}

export class GpuPassTimers {
  readonly enabled: boolean;

  private readonly querySet: GPUQuerySet | null;
  private readonly resolveBuffer: GPUBuffer | null;
  private readonly stagingBuffer: GPUBuffer | null;
  private readonly regionMs = new Float32Array(REGION_COUNT);
  private frameMs = 0;
  private pendingReadback = false;
  private framesSinceResolve = 0;
  /** Resolve every N frames to amortize readback cost. */
  private readonly resolveInterval = 2;

  constructor(device: GPUDevice) {
    this.enabled = device.features.has('timestamp-query');
    if (!this.enabled) {
      this.querySet = null;
      this.resolveBuffer = null;
      this.stagingBuffer = null;
      return;
    }

    this.querySet = device.createQuerySet({
      type: 'timestamp',
      count: QUERY_COUNT,
      label: 'pass-timers',
    });
    this.resolveBuffer = device.createBuffer({
      size: RESOLVE_BYTE_SIZE,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      label: 'pass-timers-resolve',
    });
    this.stagingBuffer = device.createBuffer({
      size: RESOLVE_BYTE_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      label: 'pass-timers-staging',
    });
  }

  /** Write start timestamp for a region (call at region entry). */
  beginRegion(
    encoder: GPUComputePassEncoder | GPURenderPassEncoder | GPUCommandEncoder,
    region: PassTimerRegion,
  ): void {
    if (!this.enabled || !this.querySet) return;
    const idx = regionIndex(region) * 2;
    (encoder as unknown as TimestampEncoder).writeTimestamp(this.querySet, idx);
  }

  /** Write end timestamp for a region (call at region exit). */
  endRegion(
    encoder: GPUComputePassEncoder | GPURenderPassEncoder | GPUCommandEncoder,
    region: PassTimerRegion,
  ): void {
    if (!this.enabled || !this.querySet) return;
    const idx = regionIndex(region) * 2 + 1;
    (encoder as unknown as TimestampEncoder).writeTimestamp(this.querySet, idx);
  }

  /**
   * Resolve timestamps after queue submit. Kicks async readback; prior frame results
   * remain in `regionMs` until the map completes.
   */
  resolveAfterSubmit(device: GPUDevice, commandEncoder: GPUCommandEncoder): void {
    if (!this.enabled || !this.querySet || !this.resolveBuffer || !this.stagingBuffer) return;

    this.framesSinceResolve++;
    if (this.framesSinceResolve < this.resolveInterval) return;
    this.framesSinceResolve = 0;

    if (this.pendingReadback) return;

    commandEncoder.resolveQuerySet(this.querySet, 0, QUERY_COUNT, this.resolveBuffer, 0);
    commandEncoder.copyBufferToBuffer(this.resolveBuffer, 0, this.stagingBuffer, 0, RESOLVE_BYTE_SIZE);

    this.pendingReadback = true;
    const staging = this.stagingBuffer;
    const regionMs = this.regionMs;

    void device.queue.onSubmittedWorkDone().then(() => {
      void staging.mapAsync(GPUMapMode.READ).then(() => {
        const mapped = new BigUint64Array(staging.getMappedRange());
        let totalNs = 0;
        for (let r = 0; r < REGION_COUNT; r++) {
          const start = mapped[r * 2];
          const end = mapped[r * 2 + 1];
          const deltaNs = end > start ? Number(end - start) : 0;
          regionMs[r] = deltaNs / 1_000_000;
          totalNs += deltaNs;
        }
        this.frameMs = totalNs / 1_000_000;
        staging.unmap();
        this.pendingReadback = false;
      }).catch(() => {
        staging.unmap();
        this.pendingReadback = false;
      });
    }).catch(() => {
      this.pendingReadback = false;
    });
  }

  snapshot(): PassTimerSnapshot {
    const regions = {} as Record<PassTimerRegion, number>;
    for (let i = 0; i < REGION_COUNT; i++) {
      regions[PASS_TIMER_REGIONS[i]] = this.regionMs[i];
    }
    return {
      enabled: this.enabled,
      frameMs: this.frameMs,
      regions,
    };
  }
}
