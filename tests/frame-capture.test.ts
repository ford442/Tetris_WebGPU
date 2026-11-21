import { describe, expect, it, vi } from 'vitest';
import {
  FrameCapture,
  alignedBytesPerRow,
  convertCaptureToRgba8,
  halfToFloat,
  isCaptureFormat,
} from '../src/webgpu/frameCapture.js';
import { toHalfBits } from './helpers/gpuIo.js';

describe('halfToFloat', () => {
  it('round-trips representable values, including > 1 (HDR) and subnormals', () => {
    for (const v of [0, 1, 0.5, 1.4, 2, 6.5, -3, 65504, 2 ** -24]) {
      expect(halfToFloat(toHalfBits(v))).toBeCloseTo(v, 2);
    }
    expect(halfToFloat(0x7c00)).toBe(Infinity);
    expect(Number.isNaN(halfToFloat(0x7e00))).toBe(true);
  });
});

describe('alignedBytesPerRow', () => {
  it('rounds up to 256', () => {
    expect(alignedBytesPerRow(1, 'bgra8unorm')).toBe(256);
    expect(alignedBytesPerRow(64, 'bgra8unorm')).toBe(256);
    expect(alignedBytesPerRow(65, 'rgba8unorm')).toBe(512);
    expect(alignedBytesPerRow(33, 'rgba16float')).toBe(512);
  });
  it('knows which formats it can read', () => {
    expect(isCaptureFormat('bgra8unorm')).toBe(true);
    expect(isCaptureFormat('rgba16float')).toBe(true);
    expect(isCaptureFormat('rg11b10ufloat')).toBe(false);
  });
});

describe('convertCaptureToRgba8', () => {
  it('swaps BGRA to RGBA and skips row padding', () => {
    const bytesPerRow = 256;
    const src = new Uint8Array(bytesPerRow * 2);
    // (0,0): B=10 G=20 R=30 A=255; (0,1) second row
    src.set([10, 20, 30, 255], 0);
    src.set([40, 50, 60, 255], bytesPerRow);
    const out = convertCaptureToRgba8(src, 1, 2, bytesPerRow, 'bgra8unorm');
    expect(Array.from(out)).toEqual([30, 20, 10, 255, 60, 50, 40, 255]);
  });

  it('un-premultiplies colour by alpha', () => {
    const src = new Uint8Array(256);
    src.set([64, 32, 0, 128], 0); // premultiplied half-alpha orange-ish (RGBA)
    const out = convertCaptureToRgba8(src, 1, 1, 256, 'rgba8unorm');
    expect(out[3]).toBe(128);
    expect(out[0]).toBeGreaterThanOrEqual(126);
    expect(out[0]).toBeLessThanOrEqual(128);
  });

  it('clips HDR (> 1) rgba16float to SDR white', () => {
    const src = new Uint8Array(256);
    new Uint16Array(src.buffer, 0, 4).set([toHalfBits(1.4), toHalfBits(0.5), toHalfBits(0), toHalfBits(1)]);
    const out = convertCaptureToRgba8(src, 1, 1, 256, 'rgba16float');
    expect(Array.from(out)).toEqual([255, 128, 0, 255]);
  });

  it('is transparent black for zero alpha (no NaN)', () => {
    const out = convertCaptureToRgba8(new Uint8Array(256), 1, 1, 256, 'rgba8unorm');
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });
});

describe('FrameCapture request flow', () => {
  function fakeDevice() {
    const buffer = { destroy: vi.fn() } as unknown as GPUBuffer;
    const device = { createBuffer: vi.fn(() => buffer) } as unknown as GPUDevice;
    const encoder = { copyTextureToBuffer: vi.fn() } as unknown as GPUCommandEncoder;
    return { device, encoder, buffer };
  }
  const texture = (format: string, width = 4, height = 2) => ({ format, width, height }) as unknown as GPUTexture;

  it('does nothing until a capture is requested', () => {
    const { device, encoder } = fakeDevice();
    const capture = new FrameCapture(device);
    capture.encode(encoder, texture('bgra8unorm'));
    expect(encoder.copyTextureToBuffer).not.toHaveBeenCalled();
  });

  it('encodes one aligned readback copy for a pending request', () => {
    vi.stubGlobal('GPUBufferUsage', { COPY_DST: 8, MAP_READ: 1 });
    const { device, encoder } = fakeDevice();
    const capture = new FrameCapture(device);
    void capture.request().catch(() => undefined);
    capture.encode(encoder, texture('bgra8unorm', 4, 2));
    expect(encoder.copyTextureToBuffer).toHaveBeenCalledTimes(1);
    expect(device.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 256 * 2 }));
    // A second frame does not copy again.
    capture.encode(encoder, texture('bgra8unorm', 4, 2));
    expect(encoder.copyTextureToBuffer).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('rejects a second request while one is in flight', async () => {
    const { device } = fakeDevice();
    const capture = new FrameCapture(device);
    void capture.request().catch(() => undefined);
    await expect(capture.request()).rejects.toThrow('capture-busy');
  });

  it('rejects an unreadable format instead of copying', async () => {
    const { device, encoder } = fakeDevice();
    const capture = new FrameCapture(device);
    const p = capture.request();
    capture.encode(encoder, texture('rg11b10ufloat'));
    await expect(p).rejects.toThrow('capture-unsupported-format');
    expect(encoder.copyTextureToBuffer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// The real readback path on a software WebGPU adapter (a plain texture stands in for the canvas
// texture: Playwright's SwiftShader cannot present a COPY_SRC swap chain, so the browser can't
// exercise this — see tests/e2e/presentation.spec.ts).
// ---------------------------------------------------------------------------------------------

import { acquireDawn, gpuRequired, skipMessage } from './helpers/dawn.js';
import { uploadTexture } from './helpers/gpuIo.js';

const dawn = await acquireDawn();
if (!dawn.ok && !gpuRequired()) console.warn(skipMessage('frame-capture', dawn.reason));

async function readBack(
  device: GPUDevice,
  format: GPUTextureFormat,
  texels: ArrayBufferView,
  width: number,
  height: number,
  bytesPerTexel: number,
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const texture = device.createTexture({
    size: [width, height, 1],
    format,
    usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
  });
  uploadTexture(device, texture, texels, width, height, bytesPerTexel);

  let captured: { rgba: Uint8ClampedArray; width: number; height: number } | null = null;
  const capture = new FrameCapture(device, async (rgba, w, h) => {
    captured = { rgba, width: w, height: h };
    return new Blob([]);
  });
  const done = capture.request();
  const encoder = device.createCommandEncoder();
  capture.encode(encoder, texture);
  device.queue.submit([encoder.finish()]);
  capture.afterSubmit();
  await done;
  return captured!;
}

describe.skipIf(!dawn.ok && !gpuRequired())('FrameCapture readback on a software WebGPU adapter', () => {
  it('has an adapter (required when TETRIS_REQUIRE_GPU=1)', () => {
    if (!dawn.ok) throw new Error(`TETRIS_REQUIRE_GPU=1 but no adapter: ${dawn.reason}`);
  });

  it.skipIf(!dawn.ok)('bgra8unorm: swaps to RGBA, drops the 256-byte row padding (odd width)', async () => {
    if (!dawn.ok) return;
    // 3x2, BGRA. Width 3 -> 12 bytes/row, padded to 256 by the copy.
    const bgra = new Uint8Array([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255,
    ]);
    const out = await readBack(dawn.gpu.device, 'bgra8unorm', bgra, 3, 2, 4);
    expect([out.width, out.height]).toEqual([3, 2]);
    expect(Array.from(out.rgba)).toEqual([
      30, 20, 10, 255, 60, 50, 40, 255, 90, 80, 70, 255,
      3, 2, 1, 255, 6, 5, 4, 255, 9, 8, 7, 255,
    ]);
  });

  it.skipIf(!dawn.ok)('rgba16float (HDR output): clips highlights past SDR white', async () => {
    if (!dawn.ok) return;
    const px = new Uint16Array([
      toHalfBits(1.4), toHalfBits(0.5), toHalfBits(0), toHalfBits(1),
      toHalfBits(0.25), toHalfBits(0.25), toHalfBits(0.25), toHalfBits(1),
    ]);
    const out = await readBack(dawn.gpu.device, 'rgba16float', px, 2, 1, 8);
    expect(Array.from(out.rgba)).toEqual([255, 128, 0, 255, 64, 64, 64, 255]);
  });
});
