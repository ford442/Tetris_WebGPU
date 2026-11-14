import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeGpuDevice,
  activeGpuDeviceOwner,
  gpuDeviceRegistrationCount,
  registerGpuDevice,
  releaseGpuDevice,
  resetGpuDeviceRegistry,
} from '../src/webgpu/gpuChores/deviceRegistry.js';
import {
  clearChoreBreadcrumbs,
  getChoreBreadcrumbs,
} from '../src/webgpu/gpuChores/breadcrumbs.js';

function fakeDevice(label: string) {
  return { label, destroy: vi.fn() };
}

beforeEach(() => {
  resetGpuDeviceRegistry();
  clearChoreBreadcrumbs();
});

describe('single-device registry', () => {
  it('starts empty', () => {
    expect(activeGpuDevice()).toBeNull();
    expect(gpuDeviceRegistrationCount()).toBe(0);
  });

  it('exposes the device chores must adopt', () => {
    const device = fakeDevice('tetris-main-device');
    registerGpuDevice(device, 'webgpu');
    expect(activeGpuDevice()).toBe(device);
    expect(activeGpuDeviceOwner()).toBe('webgpu');
    expect(gpuDeviceRegistrationCount()).toBe(1);
  });

  it('is idempotent for the same device', () => {
    const device = fakeDevice('d');
    registerGpuDevice(device, 'webgpu');
    const again = registerGpuDevice(device, 'webgpu');
    expect(again.replacedPrevious).toBe(false);
    expect(gpuDeviceRegistrationCount()).toBe(1);
    expect(device.destroy).not.toHaveBeenCalled();
  });

  it('retires the predecessor so a session never runs two live devices', () => {
    const cpp = fakeDevice('cpp-device');
    const ts = fakeDevice('ts-device');
    registerGpuDevice(cpp, 'webgpu-cpp');
    const second = registerGpuDevice(ts, 'webgpu');

    expect(second.replacedPrevious).toBe(true);
    expect(cpp.destroy).toHaveBeenCalledTimes(1);
    expect(activeGpuDevice()).toBe(ts);
    expect(getChoreBreadcrumbs().map((c) => c.event)).toContain('device:replaced');
  });

  it('releases a device the renderer handed back (cpp init failure)', () => {
    const cpp = fakeDevice('cpp-device');
    registerGpuDevice(cpp, 'webgpu-cpp');
    releaseGpuDevice(cpp, 'cpp-init-failed');

    expect(cpp.destroy).toHaveBeenCalledTimes(1);
    expect(activeGpuDevice()).toBeNull();
    const release = getChoreBreadcrumbs().find((c) => c.event === 'device:released');
    expect(release?.detail).toContain('cpp-init-failed');
  });

  it('ignores a release for a device that is not the active one', () => {
    const active = fakeDevice('active');
    const stale = fakeDevice('stale');
    registerGpuDevice(active, 'webgpu');
    releaseGpuDevice(stale, 'stale');

    expect(stale.destroy).not.toHaveBeenCalled();
    expect(activeGpuDevice()).toBe(active);
  });

  it('survives a destroy that throws on an already-lost device', () => {
    const lost = { label: 'lost', destroy: () => { throw new Error('already lost'); } };
    registerGpuDevice(lost, 'webgpu');
    expect(() => releaseGpuDevice(lost, 'device-lost')).not.toThrow();
    expect(activeGpuDevice()).toBeNull();
  });
});
