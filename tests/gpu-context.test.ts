import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  resolvePowerPreference,
  selectOptionalFeatures,
  requestGpuAdapterAndDevice,
  resolveRequiredLimits,
  REQUIRED_GPU_LIMITS,
  DESIRED_OPTIONAL_FEATURES,
} from '../src/webgpu/gpuContext.js';
import { SETTINGS_STORAGE_KEY, settingsFromPreset } from '../src/config/gameSettings.js';

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

describe('resolvePowerPreference', () => {
  it('defaults to high-performance', () => {
    expect(resolvePowerPreference('', null)).toBe('high-performance');
  });

  it('honors ?gpu=low', () => {
    expect(resolvePowerPreference('?gpu=low', null)).toBe('low-power');
    expect(resolvePowerPreference('?gpu=low-power', null)).toBe('low-power');
  });

  it('honors ?gpu=high', () => {
    expect(resolvePowerPreference('?gpu=high', null)).toBe('high-performance');
  });

  it('falls back to storage when query absent', () => {
    expect(resolvePowerPreference('', 'low')).toBe('low-power');
    expect(resolvePowerPreference('', 'high')).toBe('high-performance');
  });

  it('query overrides storage', () => {
    expect(resolvePowerPreference('?gpu=low', 'high')).toBe('low-power');
  });
});

describe('selectOptionalFeatures', () => {
  it('returns only features the adapter advertises', () => {
    const adapterFeatures = new Set<string>(['shader-f16', 'timestamp-query']);
    const selected = selectOptionalFeatures(adapterFeatures);
    expect(selected).toContain('shader-f16');
    expect(selected).toContain('timestamp-query');
    expect(selected).not.toContain('texture-compression-astc');
  });

  it('returns empty for null adapter features', () => {
    expect(selectOptionalFeatures(null)).toEqual([]);
    expect(selectOptionalFeatures(undefined)).toEqual([]);
  });

  it('never returns a feature outside the candidate list', () => {
    const adapterFeatures = new Set<string>([...DESIRED_OPTIONAL_FEATURES, 'depth-clip-control']);
    const selected = selectOptionalFeatures(adapterFeatures);
    expect(selected).not.toContain('depth-clip-control');
  });

  it('tolerates a throwing has()', () => {
    const bad = { has() { throw new Error('boom'); } };
    expect(selectOptionalFeatures(bad)).toEqual([]);
  });
});

describe('resolveRequiredLimits', () => {
  it('returns empty object when adapter has no limits', () => {
    expect(resolveRequiredLimits(null)).toEqual({});
    expect(resolveRequiredLimits(undefined)).toEqual({});
    expect(resolveRequiredLimits({})).toEqual({});
  });

  it('clamps desired limits to what the adapter reports', () => {
    const adapter = { limits: { maxStorageBuffersPerShaderStage: 2, maxComputeWorkgroupSizeX: 256 } };
    const resolved = resolveRequiredLimits(adapter);
    expect(resolved.maxStorageBuffersPerShaderStage).toBe(2);
    expect(resolved.maxComputeWorkgroupSizeX).toBe(REQUIRED_GPU_LIMITS.maxComputeWorkgroupSizeX);
  });

  it('omits limits the adapter does not report', () => {
    const adapter = { limits: { maxStorageBuffersPerShaderStage: 8 } };
    const resolved = resolveRequiredLimits(adapter);
    expect(resolved).toEqual({ maxStorageBuffersPerShaderStage: 4 });
    expect(resolved.maxComputeWorkgroupSizeX).toBeUndefined();
  });

  it('never requests more than REQUIRED_GPU_LIMITS asks for', () => {
    const adapter = { limits: { maxStorageBuffersPerShaderStage: 999, maxComputeWorkgroupSizeX: 999, maxComputeInvocationsPerWorkgroup: 999 } };
    const resolved = resolveRequiredLimits(adapter);
    for (const key of Object.keys(REQUIRED_GPU_LIMITS)) {
      expect(resolved[key]).toBeLessThanOrEqual(REQUIRED_GPU_LIMITS[key]);
    }
  });
});

describe('requestGpuAdapterAndDevice', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  function mockGpu(options: {
    adapter?: GPUAdapter | null;
    requestAdapterThrows?: boolean;
    requestDeviceThrowsOnce?: boolean;
    features?: Set<string>;
  }) {
    const device = { label: '' } as GPUDevice;
    const requestDevice = vi.fn(async (desc?: GPUDeviceDescriptor) => {
      if (options.requestDeviceThrowsOnce) {
        options.requestDeviceThrowsOnce = false;
        throw new Error('feature set rejected');
      }
      if (desc?.label) device.label = desc.label;
      return device;
    });
    const adapter = {
      features: options.features ?? new Set<string>(),
      requestDevice,
    } as unknown as GPUAdapter;

    const requestAdapter = options.requestAdapterThrows
      ? vi.fn(async () => { throw new Error('adapter boom'); })
      : vi.fn(async (opts?: GPURequestAdapterOptions) => {
          void opts;
          return options.adapter === undefined ? adapter : options.adapter;
        });

    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter } },
      configurable: true,
    });

    return { requestAdapter, requestDevice, device };
  }

  it('returns null when navigator.gpu is missing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    await expect(requestGpuAdapterAndDevice()).resolves.toBeNull();
  });

  it('honors ?gpu=low via requestAdapter powerPreference', async () => {
    const { requestAdapter } = mockGpu({});
    await requestGpuAdapterAndDevice({ search: '?gpu=low', storageValue: null });
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'low-power' });
  });

  it('requests optional features supported by the adapter', async () => {
    const { requestDevice } = mockGpu({
      features: new Set<string>(['shader-f16', 'timestamp-query']),
    });
    const result = await requestGpuAdapterAndDevice({ search: '', storageValue: null });
    expect(result?.enabledFeatures).toEqual(['timestamp-query', 'shader-f16']);
    expect(requestDevice).toHaveBeenCalledWith({
      label: 'tetris-main-device',
      requiredFeatures: ['timestamp-query', 'shader-f16'],
      requiredLimits: {},
    });
  });

  it('requests clamped limits when the adapter reports them', async () => {
    const device = { label: '' } as GPUDevice;
    const requestDevice = vi.fn(async (desc?: GPUDeviceDescriptor) => {
      if (desc?.label) device.label = desc.label;
      return device;
    });
    const adapter = {
      features: new Set<string>(),
      limits: { maxStorageBuffersPerShaderStage: 2 },
      requestDevice,
    } as unknown as GPUAdapter;
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter: vi.fn(async () => adapter) } },
      configurable: true,
    });

    const result = await requestGpuAdapterAndDevice({ search: '', storageValue: null });
    expect(result?.enabledLimits.maxStorageBuffersPerShaderStage).toBe(2);
    expect(requestDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredLimits: expect.objectContaining({ maxStorageBuffersPerShaderStage: 2 }),
      }),
    );
  });

  it('retries with a minimal labeled device when optional features fail', async () => {
    const { requestDevice } = mockGpu({ requestDeviceThrowsOnce: true });
    const result = await requestGpuAdapterAndDevice({ search: '', storageValue: null });
    expect(result?.device).toBeTruthy();
    expect(requestDevice).toHaveBeenCalledTimes(2);
    expect(requestDevice.mock.calls[1]?.[0]).toEqual({ label: 'tetris-main-device' });
  });

  it('returns null when requestAdapter yields no adapter', async () => {
    mockGpu({ adapter: null });
    await expect(requestGpuAdapterAndDevice()).resolves.toBeNull();
  });

  it('returns null when requestAdapter throws', async () => {
    mockGpu({ requestAdapterThrows: true });
    await expect(requestGpuAdapterAndDevice()).resolves.toBeNull();
  });

  it('never requests features outside DESIRED_OPTIONAL_FEATURES', async () => {
    const { requestDevice } = mockGpu({
      features: new Set<string>([...DESIRED_OPTIONAL_FEATURES, 'depth-clip-control']),
    });
    await requestGpuAdapterAndDevice();
    const firstCall = requestDevice.mock.calls[0]?.[0] as GPUDeviceDescriptor | undefined;
    expect(firstCall?.requiredFeatures).not.toContain('depth-clip-control');
  });
});

describe('requestGpuAdapterAndDevice — GameSettings.gpuPower wiring', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  function mockAdapter(requestAdapter: ReturnType<typeof vi.fn>) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter } },
      configurable: true,
    });
  }

  it('falls back to the persisted settings gpuPower when no storageValue is given', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settingsFromPreset('high', { gpuPower: 'low-power' })),
    );
    const device = { label: '' } as GPUDevice;
    const adapter = { features: new Set<string>(), requestDevice: vi.fn(async () => device) } as unknown as GPUAdapter;
    const requestAdapter = vi.fn(async () => adapter);
    mockAdapter(requestAdapter);

    await requestGpuAdapterAndDevice();
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'low-power' });
  });

  it('an explicit storageValue takes priority over persisted settings', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settingsFromPreset('high', { gpuPower: 'low-power' })),
    );
    const device = { label: '' } as GPUDevice;
    const adapter = { features: new Set<string>(), requestDevice: vi.fn(async () => device) } as unknown as GPUAdapter;
    const requestAdapter = vi.fn(async () => adapter);
    mockAdapter(requestAdapter);

    await requestGpuAdapterAndDevice({ storageValue: 'high-performance' });
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
  });

  it('?gpu= query still overrides persisted settings', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settingsFromPreset('high', { gpuPower: 'low-power' })),
    );
    const device = { label: '' } as GPUDevice;
    const adapter = { features: new Set<string>(), requestDevice: vi.fn(async () => device) } as unknown as GPUAdapter;
    const requestAdapter = vi.fn(async () => adapter);
    mockAdapter(requestAdapter);

    await requestGpuAdapterAndDevice({ search: '?gpu=high' });
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
  });
});
