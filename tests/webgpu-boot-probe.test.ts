import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectBrowser,
  buildWebgpuProbe,
  recordWebgpuProbe,
  getWebgpuProbe,
} from '../src/webgpu/bootProbe.js';
import { requestGpuAdapterAndDevice, getLastGpuAcquireDiagnostics } from '../src/webgpu/gpuContext.js';
import { configurePresentation } from '../src/webgpu/presentation.js';

describe('detectBrowser', () => {
  it('tells Chrome and Edge apart even though both are Chromium', () => {
    const chromeUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const edgeUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    expect(detectBrowser(chromeUa)).toBe('chrome');
    expect(detectBrowser(edgeUa)).toBe('edge');
  });

  it('recognizes Firefox and Safari', () => {
    expect(detectBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toBe('firefox');
    expect(
      detectBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBe('safari');
  });

  it('falls back to "other" for an unrecognized UA', () => {
    expect(detectBrowser('SomeBot/1.0')).toBe('other');
  });
});

describe('recordWebgpuProbe / getWebgpuProbe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips through window.webgpuProbe', () => {
    const fakeWindow = {} as Window;
    vi.stubGlobal('window', fakeWindow);
    const probe = { ok: true, browser: 'chrome', reason: null, adapter: 'test-adapter', adapterAttempt: null, renderer: 'ts' as const, features: [], limits: null, presentation: null };
    recordWebgpuProbe(probe);
    expect(getWebgpuProbe()).toEqual(probe);
    expect((fakeWindow as unknown as { webgpuProbe: unknown }).webgpuProbe).toEqual(probe);
  });

  it('returns null when window is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(getWebgpuProbe()).toBeNull();
  });
});

describe('buildWebgpuProbe', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('records ok:true with the adapter description on success', async () => {
    const device = { label: '' } as GPUDevice;
    const adapter = {
      features: new Set<string>(),
      info: { vendor: 'acme', architecture: 'arm', device: 'gpu-1', description: 'Acme GPU' },
      requestDevice: vi.fn(async () => device),
    } as unknown as GPUAdapter;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: { requestAdapter: vi.fn(async () => adapter) },
        userAgent: 'Chrome/120.0.0.0',
      },
      configurable: true,
    });

    const bundle = await requestGpuAdapterAndDevice({ search: '', storageValue: null });
    expect(bundle).not.toBeNull();

    const probe = buildWebgpuProbe('ts', true);
    expect(probe.ok).toBe(true);
    expect(probe.reason).toBeNull();
    expect(probe.adapter).toContain('Acme GPU');
    expect(probe.renderer).toBe('ts');
    expect(getWebgpuProbe()).toEqual(probe);
  });

  it('reports enabled features, requested/adapter/granted limits and the presentation', async () => {
    const device = { label: '', limits: { maxTextureDimension2D: 8192, maxBindGroups: 1, maxStorageBuffersPerShaderStage: 4 } } as unknown as GPUDevice;
    const adapter = {
      features: new Set<string>(['timestamp-query', 'shader-f16']),
      limits: { maxTextureDimension2D: 16384, maxBindGroups: 4, maxStorageBuffersPerShaderStage: 10 },
      info: { vendor: 'acme', architecture: 'arm', device: 'gpu-1', description: 'Acme GPU' },
      requestDevice: vi.fn(async () => device),
    } as unknown as GPUAdapter;
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter: vi.fn(async () => adapter) }, userAgent: 'Chrome/120.0.0.0' },
      configurable: true,
    });
    await requestGpuAdapterAndDevice({ search: '', storageValue: null });
    const configure = vi.fn();
    configurePresentation({ configure }, device, { sdrFormat: 'bgra8unorm', search: '', hdrSetting: false });

    const probe = buildWebgpuProbe('ts', true);
    // shader-f16 is advertised by the adapter but not used, so it is not enabled.
    expect(probe.features).toEqual(['timestamp-query']);
    expect(probe.limits?.requested).toMatchObject({ maxStorageBuffersPerShaderStage: 4, maxBindGroups: 1 });
    expect(probe.limits?.adapter).toMatchObject({ maxTextureDimension2D: 16384, maxBindGroups: 4 });
    expect(probe.limits?.granted).toMatchObject({ maxTextureDimension2D: 8192, maxBindGroups: 1 });
    expect(probe.presentation).toMatchObject({
      format: 'bgra8unorm',
      colorSpace: 'srgb',
      toneMapping: 'standard',
      hdr: false,
      hdrStatus: 'off',
    });
    // JSON-serializable, like the rest of the probe.
    expect(() => JSON.stringify(probe)).not.toThrow();
  });

  it('has no presentation on a failed boot', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter: vi.fn(async () => null) }, userAgent: 'Chrome/120.0.0.0' },
      configurable: true,
    });
    await requestGpuAdapterAndDevice({ search: '', storageValue: null });
    const probe = buildWebgpuProbe('ts', false);
    expect(probe.presentation).toBeNull();
    expect(probe.features).toEqual([]);
    expect(probe.limits).toBeNull();
  });

  it('reports different reason text for Chrome vs Edge on the same failure', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter: vi.fn(async () => null) }, userAgent: 'irrelevant' },
      configurable: true,
    });
    const bundle = await requestGpuAdapterAndDevice({ search: '', storageValue: null });
    expect(bundle).toBeNull();
    expect(getLastGpuAcquireDiagnostics().reason).toBe('no-adapter');

    const chromeProbe = buildWebgpuProbe('ts', false);
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter: vi.fn(async () => null) }, userAgent: 'x Edg/120.0.0.0' },
      configurable: true,
    });
    await requestGpuAdapterAndDevice({ search: '', storageValue: null });

    // Rebuild the Chrome probe's browser under a Chrome UA for a fair comparison.
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined, userAgent: 'x Chrome/120.0.0.0' },
      configurable: true,
    });
    const chromeReprobe = buildWebgpuProbe('ts', false);
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined, userAgent: 'x Edg/120.0.0.0' },
      configurable: true,
    });
    const edgeProbe = buildWebgpuProbe('ts', false);

    expect(chromeReprobe.browser).toBe('chrome');
    expect(edgeProbe.browser).toBe('edge');
    expect(chromeReprobe.reason).not.toBe(edgeProbe.reason);
    expect(chromeReprobe.reason).toMatch(/chrome:\/\/flags/i);
    expect(edgeProbe.reason).toMatch(/edge:\/\/flags/i);
    void chromeProbe;
  });

  it('uses a reasonOverride when the failure never reached device acquisition (e.g. cpp wasm missing)', () => {
    const probe = buildWebgpuProbe('cpp', false, 'cpp-wasm-missing');
    expect(probe.ok).toBe(false);
    expect(probe.renderer).toBe('cpp');
    expect(probe.reason).toContain('cpp-wasm-missing');
  });
});
