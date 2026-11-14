/**
 * Single-GPU-device registry for the session.
 *
 * The renderer fallback chain can *ask* for a device more than once (cpp
 * renderer boots, fails init, TS WebGPU takes over), and device-loss recovery
 * deliberately creates a replacement. What must never happen is two live
 * devices at the same time: two devices means two copies of every pipeline and
 * texture, and a chore that adopted the losing one silently stops matching the
 * frame on screen.
 *
 * So every `requestGpuAdapterAndDevice()` result is registered here, chores
 * adopt *the registered device only* (never their own), and a replacement
 * retires its predecessor. Pure bookkeeping — it holds no GPU resources of its
 * own and works against any object shaped like a `GPUDevice`, which keeps it
 * unit-testable without a browser.
 */

import { recordChoreBreadcrumb } from './breadcrumbs.js';

/** Minimal surface used here — real `GPUDevice`s and test doubles both satisfy it. */
export interface RegistrableDevice {
  label?: string;
  destroy?: () => void;
}

export type DeviceOwner = 'webgpu' | 'webgpu-cpp' | 'unknown';

export interface DeviceRegistration {
  device: RegistrableDevice;
  owner: DeviceOwner;
  /** True when this registration retired a different, still-live device. */
  replacedPrevious: boolean;
}

let active: { device: RegistrableDevice; owner: DeviceOwner } | null = null;
let registeredCount = 0;

/** Devices registered this session (a healthy session ends at 1). */
export function gpuDeviceRegistrationCount(): number {
  return registeredCount;
}

/** The device chores must adopt, or `null` when no renderer has one yet. */
export function activeGpuDevice(): RegistrableDevice | null {
  return active?.device ?? null;
}

/** Which renderer owns the live device. */
export function activeGpuDeviceOwner(): DeviceOwner | null {
  return active?.owner ?? null;
}

/**
 * Register the device a renderer just acquired.
 *
 * Registering a *different* device while one is live destroys the predecessor:
 * that only happens when a renderer handed its device off (cpp init failed) or
 * when loss recovery replaced a dead one, and in both cases the old device has
 * no live consumer left. Destroy failures are swallowed — a device that is
 * already lost throws nothing useful.
 */
export function registerGpuDevice(
  device: RegistrableDevice,
  owner: DeviceOwner = 'unknown',
): DeviceRegistration {
  if (active && active.device === device) {
    return { device, owner: active.owner, replacedPrevious: false };
  }

  let replacedPrevious = false;
  if (active) {
    replacedPrevious = true;
    recordChoreBreadcrumb(
      'device:replaced',
      `${active.owner}:${active.device.label ?? '?'} -> ${owner}:${device.label ?? '?'}`,
    );
    retire(active.device);
  }

  active = { device, owner };
  registeredCount += 1;
  recordChoreBreadcrumb('device:registered', `${owner}:${device.label ?? '?'} (#${registeredCount})`);
  return { device, owner, replacedPrevious };
}

/**
 * Release a device the caller is done with (cpp init failure, view teardown).
 * Destroys it so the next renderer in the fallback chain starts from zero live
 * devices. Releasing a device that is not the active one is a no-op.
 */
export function releaseGpuDevice(device: RegistrableDevice | null | undefined, why = 'released'): void {
  if (!device) return;
  if (active?.device !== device) {
    recordChoreBreadcrumb('device:release-ignored', why);
    return;
  }
  recordChoreBreadcrumb('device:released', `${active.owner}:${device.label ?? '?'} (${why})`);
  active = null;
  retire(device);
}

/** Test seam: forget all bookkeeping without destroying anything. */
export function resetGpuDeviceRegistry(): void {
  active = null;
  registeredCount = 0;
}

function retire(device: RegistrableDevice): void {
  try {
    device.destroy?.();
  } catch {
    /* already lost — nothing to clean up */
  }
}
