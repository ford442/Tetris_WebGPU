import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GpuChoreRunner } from '../src/webgpu/gpuChores/runner.js';
import { LUMA_HISTOGRAM_BINS, lumaBin } from '../src/webgpu/gpuChores/lumaStats.js';
import { CHORE_WORKGROUP_2D } from '../src/webgpu/gpuChores/shaders.js';
import {
  clearChoreBreadcrumbs,
  getChoreBreadcrumbs,
} from '../src/webgpu/gpuChores/breadcrumbs.js';

interface FakeBuffer {
  label?: string;
  size: number;
  usage: number;
  destroy: () => void;
  mapAsync: (mode: number, offset?: number, size?: number) => Promise<void>;
  getMappedRange: (offset?: number, size?: number) => ArrayBuffer;
  unmap: () => void;
}

/**
 * Minimal stand-in for the slice of GPUDevice the runner touches. Records the
 * encoded work so the tests can assert on dispatch shape without a browser.
 */
function createFakeDevice(options: { histogram?: Uint32Array } = {}) {
  const dispatches: Array<{ label: string; x: number; y: number }> = [];
  const buffers: FakeBuffer[] = [];
  const clears: number[] = [];
  const copies: number[] = [];
  let mapResolve: (() => void) | null = null;

  const makeBuffer = (desc: { label?: string; size: number; usage: number }): FakeBuffer => {
    const backing = new ArrayBuffer(desc.size);
    if (options.histogram && desc.label?.includes('readback')) {
      new Uint32Array(backing).set(options.histogram.subarray(0, desc.size / 4));
    }
    const buffer: FakeBuffer = {
      label: desc.label,
      size: desc.size,
      usage: desc.usage,
      destroy: vi.fn(),
      mapAsync: () => new Promise<void>((resolve) => { mapResolve = resolve; }),
      getMappedRange: () => backing,
      unmap: vi.fn(),
    };
    buffers.push(buffer);
    return buffer;
  };

  const pass = (label: string) => ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: (x: number, y = 1) => { dispatches.push({ label, x, y }); },
    end: vi.fn(),
  });

  const device = {
    label: 'fake-device',
    createShaderModule: vi.fn((d: { label?: string; code: string }) => ({ label: d.label, code: d.code })),
    createComputePipeline: vi.fn((d: { label?: string }) => ({
      label: d.label,
      getBindGroupLayout: vi.fn(() => ({ label: `${d.label}:layout` })),
    })),
    createBuffer: vi.fn(makeBuffer),
    createTexture: vi.fn((d: { label?: string }) => ({
      label: d.label,
      createView: vi.fn(() => ({ label: `${d.label}:view` })),
      destroy: vi.fn(),
    })),
    createBindGroup: vi.fn((d: unknown) => d),
    createCommandEncoder: vi.fn((d?: { label?: string }) => makeEncoder(d?.label ?? 'encoder')),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
  };

  function makeEncoder(label: string) {
    return {
      label,
      clearBuffer: (_b: unknown, _o: number, size: number) => { clears.push(size); },
      beginComputePass: (d?: { label?: string }) => pass(d?.label ?? label),
      copyBufferToBuffer: (_s: unknown, _so: number, _d: unknown, _do: number, size: number) => {
        copies.push(size);
      },
      finish: vi.fn(() => ({ label })),
    };
  }

  return {
    device: device as unknown as GPUDevice,
    dispatches,
    buffers,
    clears,
    copies,
    makeEncoder,
    /** Resolve the pending mapAsync, as the GPU would once the copy lands. */
    settleMap: async () => {
      mapResolve?.();
      mapResolve = null;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

const view = { label: 'source-view' } as unknown as GPUTextureView;

function webgpuRunner(device: GPUDevice, options = {}) {
  return GpuChoreRunner.create({
    device,
    policy: { backend: 'webgpu', reason: 'ok' },
    scanIntervalFrames: 1,
    ...options,
  });
}

beforeEach(() => clearChoreBreadcrumbs());

describe('GpuChoreRunner device adoption', () => {
  it('adopts the device it is handed and never requests one', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device);
    runner.encodeLumaScan(fake.makeEncoder('frame') as unknown as GPUCommandEncoder, view, 1920, 1080);
    // Everything came off the passed-in device.
    expect(fake.device.createComputePipeline).toHaveBeenCalled();
    expect(runner.backend).toBe('webgpu');
  });

  it('runs on the CPU rung with no device', () => {
    const runner = GpuChoreRunner.create({ device: null, rendererName: 'webgl2' });
    expect(runner.backend).toBe('cpu');
    expect(runner.stats.sampleCount).toBe(0);
  });
});

describe('encodeLumaScan', () => {
  it('encodes downsample + histogram + readback copy into the caller-supplied encoder', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device);
    const encoded = runner.encodeLumaScan(
      fake.makeEncoder('frame') as unknown as GPUCommandEncoder,
      view,
      1024,
      512,
    );

    expect(encoded).toBe(true);
    expect(fake.dispatches.map((d) => d.label)).toEqual([
      'chore:downsample_2d',
      'chore:luma_histogram',
    ]);
    // Scan target is capped at 256 on the long edge: 1024x512 -> 256x128.
    const expectedX = Math.ceil(256 / CHORE_WORKGROUP_2D);
    const expectedY = Math.ceil(128 / CHORE_WORKGROUP_2D);
    for (const dispatch of fake.dispatches) {
      expect([dispatch.x, dispatch.y]).toEqual([expectedX, expectedY]);
    }
    // The histogram is cleared before accumulating and copied out afterwards.
    expect(fake.clears).toEqual([LUMA_HISTOGRAM_BINS * 4]);
    expect(fake.copies).toEqual([LUMA_HISTOGRAM_BINS * 4]);
    // The whole transfer is 256 bytes — "a few floats", not a frame.
    expect(fake.copies[0]).toBe(256);
    // No submit of its own: the renderer owns the queue.
    expect(fake.device.queue.submit).not.toHaveBeenCalled();
  });

  it('self-throttles to one scan per interval', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device, { scanIntervalFrames: 4 });
    const results: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      results.push(runner.encodeLumaScan(
        fake.makeEncoder(`f${i}`) as unknown as GPUCommandEncoder,
        view,
        640,
        480,
      ));
    }
    expect(results.filter(Boolean).length).toBe(2);
  });

  it('skips while a readback is still in flight instead of stacking maps', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device);
    runner.encodeLumaScan(fake.makeEncoder('a') as unknown as GPUCommandEncoder, view, 640, 480);
    runner.afterSubmit();
    const second = runner.encodeLumaScan(
      fake.makeEncoder('b') as unknown as GPUCommandEncoder,
      view,
      640,
      480,
    );
    expect(second).toBe(false);
  });

  it('does nothing on the CPU rung', () => {
    const fake = createFakeDevice();
    const runner = GpuChoreRunner.create({
      device: fake.device,
      policy: { backend: 'cpu', reason: 'kill-switch' },
    });
    const encoded = runner.encodeLumaScan(
      fake.makeEncoder('frame') as unknown as GPUCommandEncoder,
      view,
      640,
      480,
    );
    expect(encoded).toBe(false);
    expect(fake.device.createComputePipeline).not.toHaveBeenCalled();
    expect(runner.status().reason).toBe('kill-switch');
  });
});

describe('readback', () => {
  it('turns the mapped histogram into stats without blocking the frame', async () => {
    const histogram = new Uint32Array(LUMA_HISTOGRAM_BINS);
    histogram[lumaBin(0.1)] = 900;
    histogram[lumaBin(1.4)] = 100;
    const fake = createFakeDevice({ histogram });
    const runner = webgpuRunner(fake.device);

    runner.encodeLumaScan(fake.makeEncoder('frame') as unknown as GPUCommandEncoder, view, 640, 480);
    runner.afterSubmit();
    // Stats are still empty until the map settles — the frame never waited.
    expect(runner.stats.sampleCount).toBe(0);

    await fake.settleMap();

    expect(runner.stats.sampleCount).toBe(1000);
    expect(runner.stats.percentileLuma).toBeGreaterThan(1.0);
    expect(runner.status().readbacks).toBe(1);
  });
});

describe('failure handling', () => {
  it('retires the GPU rung and leaves a breadcrumb when encoding throws', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device);
    const encoder = fake.makeEncoder('frame');
    encoder.beginComputePass = () => { throw new Error('device lost'); };

    const encoded = runner.encodeLumaScan(encoder as unknown as GPUCommandEncoder, view, 640, 480);

    expect(encoded).toBe(false);
    expect(runner.backend).toBe('cpu');
    const events = getChoreBreadcrumbs().map((c) => c.event);
    expect(events).toContain('luma:encode-failed');
    expect(getChoreBreadcrumbs().at(-1)?.detail).toBe('device lost');
  });

  it('stays quiet on later frames once retired', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device);
    const bad = fake.makeEncoder('bad');
    bad.beginComputePass = () => { throw new Error('boom'); };
    runner.encodeLumaScan(bad as unknown as GPUCommandEncoder, view, 640, 480);

    const after = runner.encodeLumaScan(
      fake.makeEncoder('good') as unknown as GPUCommandEncoder,
      view,
      640,
      480,
    );
    expect(after).toBe(false);
    expect(runner.stats.sampleCount).toBe(0);
  });
});

describe('compactIndices', () => {
  it('compacts spawn flags on the CPU rung for same-frame callers', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device);
    const flags = new Uint8Array(16);
    flags[2] = 1;
    flags[9] = 1;
    expect(Array.from(runner.compactIndices(flags))).toEqual([2, 9]);
  });

  it('falls back to the CPU rung when the GPU compaction fails', async () => {
    const fake = createFakeDevice();
    fake.device.createComputePipeline = vi.fn(() => { throw new Error('no pipeline'); }) as never;
    const runner = webgpuRunner(fake.device);
    const flags = new Uint8Array([0, 1, 1, 0]);
    await expect(runner.compactIndicesOnGpu(flags)).resolves.toEqual(Uint32Array.from([1, 2]));
    expect(runner.backend).toBe('cpu');
  });
});

describe('destroy', () => {
  it('releases its own resources and leaves the device alone', () => {
    const fake = createFakeDevice();
    const runner = webgpuRunner(fake.device);
    runner.encodeLumaScan(fake.makeEncoder('frame') as unknown as GPUCommandEncoder, view, 640, 480);
    runner.destroy();
    expect(fake.buffers.every((b) => (b.destroy as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0)).toBe(true);
    expect(getChoreBreadcrumbs().map((c) => c.event)).toContain('chores:destroyed');
  });
});
