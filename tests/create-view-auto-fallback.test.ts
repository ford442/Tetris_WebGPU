import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { webgpuCreate, webgl2Create, showOverlay } = vi.hoisted(() => ({
  webgpuCreate: vi.fn(),
  webgl2Create: vi.fn(),
  showOverlay: vi.fn(),
}));

vi.mock('../src/viewWebGPU.js', () => ({ default: { create: webgpuCreate } }));
vi.mock('../src/viewWebGL2/viewWebGL2.js', () => ({ default: { create: webgl2Create } }));
vi.mock('../src/webgpu/fatalBootOverlay.js', () => ({ showFatalWebgpuOverlay: showOverlay }));

import { createView } from '../src/view/createView.js';

const ARGS = [{} as HTMLElement, 800, 600, 20, 10, {} as CanvasRenderingContext2D, {} as CanvasRenderingContext2D] as const;

function stubBrowser(opts: { search?: string; stored?: string | null; gpu: unknown }): void {
  vi.stubGlobal('window', {
    location: { search: opts.search ?? '' },
    localStorage: {
      getItem: (k: string) => (k === 'tetris_renderer' ? opts.stored ?? null : null),
      setItem: () => {},
      removeItem: () => {},
    },
  });
  vi.stubGlobal('navigator', { gpu: opts.gpu, userAgent: 'x Chrome/120.0.0.0' });
}

describe('createView: auto falls back to WebGL2 only when WebGPU has no adapter', () => {
  beforeEach(() => {
    webgpuCreate.mockReset();
    webgl2Create.mockReset();
    showOverlay.mockReset();
    webgl2Create.mockResolvedValue({ rendererName: 'webgl2' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navigator.gpu missing -> WebGL2, no WebGPU view constructed', async () => {
    stubBrowser({ gpu: undefined });
    const view = await createView(...ARGS);
    expect(view.rendererName).toBe('webgl2');
    expect(view.fallbackReason).toMatch(/^navigator.gpu-unavailable/);
    expect(webgpuCreate).not.toHaveBeenCalled();
    expect(showOverlay).not.toHaveBeenCalled();
    expect((window as unknown as { webgpuProbe: { ok: boolean } }).webgpuProbe.ok).toBe(false);
  });

  it('requestAdapter() -> null -> WebGL2', async () => {
    stubBrowser({ gpu: { requestAdapter: vi.fn(async () => null) } });
    const view = await createView(...ARGS);
    expect(view.rendererName).toBe('webgl2');
    expect(view.fallbackReason).toMatch(/^no-adapter/);
    expect(webgpuCreate).not.toHaveBeenCalled();
  });

  it('requestAdapter() throws -> WebGL2', async () => {
    stubBrowser({ gpu: { requestAdapter: vi.fn(async () => { throw new Error('blocklisted'); }) } });
    const view = await createView(...ARGS);
    expect(view.rendererName).toBe('webgl2');
    expect(view.fallbackReason).toMatch(/request-adapter-threw/);
  });

  it('an adapter exists -> stays on WebGPU (no WebGL2)', async () => {
    stubBrowser({ gpu: { requestAdapter: vi.fn(async () => ({})) } });
    webgpuCreate.mockResolvedValue({ rendererName: 'webgpu', isWebGPU: { result: true } });
    const view = await createView(...ARGS);
    expect(view.rendererName).toBe('webgpu');
    expect(webgl2Create).not.toHaveBeenCalled();
  });

  it('adapter exists but the device/view fails -> still fatal, no WebGL2 rescue', async () => {
    stubBrowser({ gpu: { requestAdapter: vi.fn(async () => ({})) } });
    webgpuCreate.mockResolvedValue({ rendererName: 'webgpu', isWebGPU: { result: false, description: 'device lost' } });
    await expect(createView(...ARGS)).rejects.toThrow(/WebGPU unavailable/);
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(webgl2Create).not.toHaveBeenCalled();
  });

  it('explicit ?renderer=webgpu with no adapter is still fatal', async () => {
    stubBrowser({ search: '?renderer=webgpu', gpu: { requestAdapter: vi.fn(async () => null) } });
    webgpuCreate.mockResolvedValue({ rendererName: 'webgpu', isWebGPU: { result: false, description: 'no-adapter' } });
    await expect(createView(...ARGS)).rejects.toThrow(/WebGPU unavailable/);
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(webgl2Create).not.toHaveBeenCalled();
  });

  it('explicit ?renderer=webgl2 still works without probing WebGPU', async () => {
    const requestAdapter = vi.fn(async () => null);
    stubBrowser({ search: '?renderer=webgl2', gpu: { requestAdapter } });
    const view = await createView(...ARGS);
    expect(view.rendererName).toBe('webgl2');
    expect(view.fallbackReason).toBeUndefined();
    expect(requestAdapter).not.toHaveBeenCalled();
  });
});
