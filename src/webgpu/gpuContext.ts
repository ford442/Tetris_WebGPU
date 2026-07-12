/**
 * WebGPU device and canvas lifecycle helpers for the View renderer.
 *
 * Centralizes adapter/device acquisition policy (power preference, optional
 * feature detection, labels) and lifecycle resilience (device-loss recovery,
 * uncaptured-error logging, pipeline error scopes) so the WebGPU-TS renderer
 * and later surfaces (C++ handoff) can share the same behavior.
 */
import { renderLogger } from '../utils/logger.js';

/**
 * Optional device features we *request when present*. These are never
 * hard-required — the device is created with only the subset the adapter
 * actually advertises, so absence degrades gracefully.
 */
export const DESIRED_OPTIONAL_FEATURES: GPUFeatureName[] = [
  'timestamp-query',
  'texture-compression-bc',
  'texture-compression-astc',
  'texture-compression-etc2',
  'shader-f16',
];

/**
 * Resolve the requested GPU power preference from `?gpu=low|high` or the
 * `tetris_gpu` localStorage key. Defaults to `high-performance` (this is a
 * game); `low`/`low-power` selects `low-power` for battery/laptop use.
 *
 * Pure and side-effect free so it can be unit tested with plain inputs.
 */
export function resolvePowerPreference(
  search?: string,
  storageValue?: string | null,
): GPUPowerPreference {
  let raw: string | null = null;
  const source = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  try {
    raw = new URLSearchParams(source).get('gpu');
  } catch {
    raw = null;
  }
  if (raw == null) {
    raw = storageValue ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('tetris_gpu') : null);
  }

  const normalized = (raw ?? '').toLowerCase();
  if (normalized === 'low' || normalized === 'low-power') return 'low-power';
  return 'high-performance';
}

/**
 * Intersect the desired optional features with what the adapter advertises.
 * `adapterFeatures` is anything with `.has()` (a real `GPUSupportedFeatures`
 * or a `Set` in tests).
 */
export function selectOptionalFeatures(
  adapterFeatures: { has(name: string): boolean } | null | undefined,
  candidates: GPUFeatureName[] = DESIRED_OPTIONAL_FEATURES,
): GPUFeatureName[] {
  if (!adapterFeatures) return [];
  return candidates.filter((f) => {
    try {
      return adapterFeatures.has(f);
    } catch {
      return false;
    }
  });
}

/** Best-effort adapter diagnostics; `adapter.info` is not available everywhere. */
function logAdapterInfo(adapter: GPUAdapter, powerPreference: GPUPowerPreference): void {
  const info = (adapter as any).info as GPUAdapterInfo | undefined;
  if (info) {
    renderLogger.info(
      `Adapter (${powerPreference}):`,
      `vendor=${info.vendor || '?'}`,
      `arch=${info.architecture || '?'}`,
      `device=${info.device || '?'}`,
      `desc=${info.description || '?'}`,
    );
  } else {
    renderLogger.info(`Adapter acquired (${powerPreference}); adapter.info unavailable`);
  }
}

/**
 * Request a GPU adapter/device and configure the canvas context.
 * Sizes the backing canvas to the device pixel ratio.
 *
 * Returns the preferred presentation format on success, or `null` if no
 * adapter/device is available (caller should abort and fall back).
 */
export async function acquireGpuContext(view: any): Promise<GPUTextureFormat | null> {
  const powerPreference = resolvePowerPreference();
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference });
  } catch (err) {
    renderLogger.error('requestAdapter threw:', err);
    return null;
  }
  if (!adapter) {
    renderLogger.error('No WebGPU adapter available');
    return null;
  }
  logAdapterInfo(adapter, powerPreference);

  const requiredFeatures = selectOptionalFeatures(adapter.features);
  if (requiredFeatures.length > 0) {
    renderLogger.info('Enabling optional features:', requiredFeatures.join(', '));
  }

  try {
    view.device = await adapter.requestDevice({
      label: 'tetris-main-device',
      requiredFeatures,
    });
  } catch (err) {
    // Feature set may be rejected on some drivers — retry with a bare device.
    renderLogger.warn('requestDevice with optional features failed; retrying minimal:', err);
    try {
      view.device = await adapter.requestDevice({ label: 'tetris-main-device' });
    } catch (err2) {
      renderLogger.error('requestDevice failed:', err2);
      return null;
    }
  }
  view.device.label = view.device.label || 'tetris-main-device';

  attachDeviceLifecycleHandlers(view);

  const dpr = window.devicePixelRatio || 1;
  view.canvasWebGPU.width = view.width * dpr;
  view.canvasWebGPU.height = view.height * dpr;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  // alphaMode 'premultiplied' is required for the video portal compositing.
  view.ctxWebGPU.configure({
    device: view.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  view.reactiveVideoBackground.setWebGPUDevice(view.device);
  return presentationFormat;
}

/**
 * Wire `device.lost` recovery and an `uncapturederror` listener. Idempotent per
 * device (each freshly created device gets its own handlers).
 */
export function attachDeviceLifecycleHandlers(view: any): void {
  const device: GPUDevice = view.device;
  if (!device) return;

  device.addEventListener('uncapturederror', (event: any) => {
    const err = event?.error;
    renderLogger.error(
      'Uncaptured GPU error',
      view._currentGpuScope ? `during ${view._currentGpuScope}` : '',
      '-',
      err?.constructor?.name || 'GPUError',
      ':',
      err?.message ?? err,
    );
  });

  device.lost.then((info: GPUDeviceLostInfo) => {
    // 'destroyed' is an intentional teardown (e.g. re-init); don't treat as fatal.
    if (info.reason === 'destroyed') {
      renderLogger.info('GPU device destroyed (intentional)');
      return;
    }
    renderLogger.error(`GPU device lost: reason=${info.reason || 'unknown'} — ${info.message}`);
    handleDeviceLost(view);
  });
}

/**
 * Attempt a single re-initialization after unexpected device loss; on failure,
 * surface an overlay and invoke the fatal hook (fallback chain) if present.
 */
async function handleDeviceLost(view: any): Promise<void> {
  if (view._recoveringDevice) return;
  view._recoveringDevice = true;
  view._deviceLost = true;

  showDeviceLostOverlay(view.element, 'GPU device lost — attempting recovery…');

  try {
    // preRender re-runs acquireGpuContext + resource setup on a fresh device.
    await view.preRender();
    if (view.device) {
      view._deviceLost = false;
      removeDeviceLostOverlay(view.element);
      renderLogger.info('GPU device recovered');
    } else {
      throw new Error('re-init produced no device');
    }
  } catch (err) {
    renderLogger.error('Device recovery failed:', err);
    showDeviceLostOverlay(view.element, 'GPU unavailable — reload to continue.');
    // Let the app-level fallback chain react (e.g. rebuild on WebGL2).
    if (typeof view.onFatalDeviceLoss === 'function') {
      try { view.onFatalDeviceLoss(); } catch { /* ignore */ }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tetris-webgpu-device-lost'));
    }
  } finally {
    view._recoveringDevice = false;
  }
}

const DEVICE_LOST_OVERLAY_ID = 'tetris-device-lost-overlay';

function showDeviceLostOverlay(element: HTMLElement | undefined, message: string): void {
  if (!element || typeof document === 'undefined') return;
  let overlay = document.getElementById(DEVICE_LOST_OVERLAY_ID) as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = DEVICE_LOST_OVERLAY_ID;
    overlay.style.cssText = [
      'position:absolute', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'display:flex', 'align-items:center', 'justify-content:center',
      'z-index:1000', 'pointer-events:none',
      'font-family:sans-serif', 'font-size:18px', 'color:#fff',
      'background:rgba(0,0,0,0.6)', 'text-align:center', 'padding:1em',
    ].join(';');
    element.appendChild(overlay);
  }
  overlay.textContent = message;
}

function removeDeviceLostOverlay(element: HTMLElement | undefined): void {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById(DEVICE_LOST_OVERLAY_ID);
  if (overlay) overlay.remove();
  void element;
}

/**
 * Push validation/out-of-memory error scopes before pipeline creation so WGSL
 * and allocation failures are reported with actionable context.
 */
export function pushGpuErrorScopes(view: any, scopeLabel: string): void {
  if (!view.device) return;
  view._currentGpuScope = scopeLabel;
  view.device.pushErrorScope('validation');
  view.device.pushErrorScope('out-of-memory');
}

/** Pop the scopes pushed by {@link pushGpuErrorScopes} and log any errors. */
export async function popGpuErrorScopes(view: any): Promise<void> {
  if (!view.device) return;
  const label = view._currentGpuScope || 'pipeline setup';
  try {
    const oom = await view.device.popErrorScope();
    const validation = await view.device.popErrorScope();
    if (oom) renderLogger.error(`Out-of-memory during ${label}:`, oom.message);
    if (validation) renderLogger.error(`Validation error during ${label}:`, validation.message);
  } catch (err) {
    renderLogger.warn('popErrorScope failed:', err);
  } finally {
    view._currentGpuScope = null;
  }
}

/**
 * Handle a window resize: recompute canvas backing size (with render scale),
 * reconfigure the context, and resize render targets / bloom.
 */
export function resizeGpuContext(view: any) {
  if (!view.device || view._deviceLost) return;
  const dpr = window.devicePixelRatio || 1;
  view.width = window.innerWidth;
  view.height = window.innerHeight;

  // Apply render scale for supersampling.
  const scaledWidth = Math.floor(view.width * dpr * view.renderScale);
  const scaledHeight = Math.floor(view.height * dpr * view.renderScale);

  view.canvasWebGPU.width = scaledWidth;
  view.canvasWebGPU.height = scaledHeight;
  // CSS keeps it at screen size, internal resolution is higher.
  view.canvasWebGPU.style.width = `${view.width}px`;
  view.canvasWebGPU.style.height = `${view.height}px`;

  view.playfildWidth = (view.width * 2) / 3;
  view.playfildHeight = view.height;
  view.playfildInnerWidth = view.playfildWidth - view.playfildBorderWidth * 2;
  view.playfildInnerHeight = view.playfildHeight - view.playfildBorderWidth * 2 - 2;

  view.visualEffects.updateVideoPosition(view.width, view.height);

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  view.ctxWebGPU.configure({
    device: view.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  view.postProcessor.resize(scaledWidth, scaledHeight);

  // Resize bloom system (async - GPU syncs before destroying old textures).
  if (view.bloomSystem) {
    view.bloomSystem.resize(scaledWidth, scaledHeight).catch(() => {});
  }
}
