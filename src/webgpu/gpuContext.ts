/**
 * WebGPU device and canvas lifecycle helpers for the View renderer.
 *
 * Centralizes adapter/device acquisition policy (power preference, optional
 * feature detection, labels) and lifecycle resilience (device-loss recovery,
 * uncaptured-error logging, pipeline error scopes) so the WebGPU-TS renderer
 * and later surfaces (C++ handoff) can share the same behavior.
 */
import { renderLogger } from '../utils/logger.js';
import { loadGameSettings } from '../config/gameSettings.js';

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
  'rg11b10ufloat-renderable',
  'float32-filterable',
];

/** Minimal host for device-loss recovery and uncaptured-error logging. */
export interface GpuDeviceLifecycleHost {
  device: GPUDevice;
  element?: HTMLElement;
  preRender?: () => Promise<void>;
  onFatalDeviceLoss?: () => void;
  _recoveringDevice?: boolean;
  _deviceLost?: boolean;
  _currentGpuScope?: string | null;
}

/** Full View surface for GPU device/canvas lifecycle helpers. */
export interface GpuContextHost extends GpuDeviceLifecycleHost {
  canvasWebGPU: HTMLCanvasElement;
  ctxWebGPU: GPUCanvasContext;
  width: number;
  height: number;
  renderScale: number;
  element: HTMLElement;
  reactiveVideoBackground: { setWebGPUDevice(d: GPUDevice): void };
  visualEffects: { updateVideoPosition(w: number, h: number): void };
  postProcessor: { resize(w: number, h: number): void };
  bloomSystem?: { resize(w: number, h: number): Promise<void> };
  playfildWidth: number;
  playfildHeight: number;
  playfildBorderWidth: number;
  playfildInnerWidth: number;
  playfildInnerHeight: number;
  preRender(): Promise<void>;
  gpuPowerPreference?: GPUPowerPreference;
  enabledGpuFeatures?: GPUFeatureName[];
}

export interface RequestGpuDeviceOptions {
  search?: string;
  storageValue?: string | null;
  deviceLabel?: string;
  /** Override the derived required limits (mainly for tests). */
  requiredLimits?: Record<string, number>;
}

export interface RequestGpuDeviceResult {
  adapter: GPUAdapter;
  device: GPUDevice;
  powerPreference: GPUPowerPreference;
  enabledFeatures: GPUFeatureName[];
  enabledLimits: Record<string, number>;
}

type AdapterWithInfo = GPUAdapter & { info?: GPUAdapterInfo };

/**
 * GPU limits this renderer actually depends on: line-clear compute reads/
 * writes 4 storage buffers (board, dissolve, clearFlags, results) in one
 * shader stage, and both the line-clear and particle compute passes dispatch
 * `@workgroup_size(64)`. These sit comfortably below WebGPU's default-limits
 * tier (8 storage buffers/stage, 256 invocations/workgroup) — requesting them
 * as `requiredLimits` turns an adapter that somehow can't provide them into a
 * clear `requestDevice()` rejection instead of a cryptic validation error
 * deep inside a compute dispatch.
 */
export const REQUIRED_GPU_LIMITS: Record<string, number> = {
  maxStorageBuffersPerShaderStage: 4,
  maxComputeWorkgroupSizeX: 64,
  maxComputeInvocationsPerWorkgroup: 64,
};

/**
 * Clamp desired limits to what the adapter actually reports so `requestDevice`
 * never rejects for asking more than a weaker adapter can give; limits the
 * adapter doesn't report at all are omitted rather than guessed.
 */
export function resolveRequiredLimits(
  adapter: { limits?: GPUSupportedLimits | Record<string, number> } | null | undefined,
  desired: Record<string, number> = REQUIRED_GPU_LIMITS,
): Record<string, number> {
  if (!adapter?.limits) return {};
  const limits = adapter.limits as unknown as Record<string, number>;
  const resolved: Record<string, number> = {};
  for (const [key, value] of Object.entries(desired)) {
    const adapterValue = limits[key];
    if (typeof adapterValue === 'number') {
      resolved[key] = Math.min(value, adapterValue);
    }
  }
  return resolved;
}

/**
 * Resolve the requested GPU power preference from `?gpu=low|high` or an
 * explicit `storageValue`. Defaults to `high-performance` (this is a game);
 * `low`/`low-power` selects `low-power` for battery/laptop use.
 *
 * Pure and side-effect free so it can be unit tested with plain inputs — the
 * `storageValue` fallback (persisted `GameSettings.gpuPower`) is resolved by
 * the caller, {@link requestGpuAdapterAndDevice}, not here.
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
    raw = storageValue ?? null;
  }

  const normalized = (raw ?? '').toLowerCase();
  if (normalized === 'low' || normalized === 'low-power') return 'low-power';
  return 'high-performance';
}

/**
 * Default `storageValue` source for {@link resolvePowerPreference} when a
 * caller doesn't supply one explicitly: the persisted settings-UI choice
 * (`GameSettings.gpuPower`, `tetris_settings` key) — so `?gpu=` (debug/manual
 * override) and the in-game GPU power select resolve through the exact same
 * policy instead of two disconnected mechanisms.
 */
function resolveGpuPowerFromSettings(): string | null {
  try {
    const gpuPower = loadGameSettings().gpuPower;
    return gpuPower === 'auto' ? null : gpuPower;
  } catch {
    return null;
  }
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
  const info = (adapter as AdapterWithInfo).info;
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
 * Request a GPU adapter and device using the shared policy (power preference,
 * optional feature detection, labeled device with retry). Pure inputs can be
 * passed for unit tests; defaults read from window location / localStorage.
 */
export async function requestGpuAdapterAndDevice(
  options: RequestGpuDeviceOptions = {},
): Promise<RequestGpuDeviceResult | null> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    renderLogger.error('WebGPU is not available');
    return null;
  }

  const storageValue = options.storageValue !== undefined
    ? options.storageValue
    : resolveGpuPowerFromSettings();
  const powerPreference = resolvePowerPreference(options.search, storageValue);
  const deviceLabel = options.deviceLabel ?? 'tetris-main-device';

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

  const requiredLimits = options.requiredLimits ?? resolveRequiredLimits(adapter);

  let device: GPUDevice;
  let enabledLimits = requiredLimits;
  try {
    device = await adapter.requestDevice({
      label: deviceLabel,
      requiredFeatures,
      requiredLimits,
    });
  } catch (err) {
    renderLogger.warn('requestDevice with optional features/limits failed; retrying minimal:', err);
    try {
      device = await adapter.requestDevice({ label: deviceLabel });
      enabledLimits = {};
    } catch (err2) {
      renderLogger.error('requestDevice failed:', err2);
      return null;
    }
  }
  device.label = device.label || deviceLabel;

  return { adapter, device, powerPreference, enabledFeatures: requiredFeatures, enabledLimits };
}

/**
 * Single source of truth for `GPUCanvasContext.configure()` — used by both
 * initial acquisition and resize so the two paths can never drift apart.
 *
 * `alphaMode: 'premultiplied'` is required for the video-portal compositing
 * (the DOM `<video>` shows through the canvas's transparent regions). `usage`
 * is left at the spec default (`RENDER_ATTACHMENT`) since nothing samples the
 * canvas texture directly today; `viewFormats` is listed explicitly as `[]`
 * so a future need (e.g. `COPY_SRC` for a screenshot path, or a `-srgb` view
 * format) has one call site to extend instead of two to keep in sync.
 */
export function buildCanvasConfiguration(
  device: GPUDevice,
  format: GPUTextureFormat,
): GPUCanvasConfiguration {
  return {
    device,
    format,
    alphaMode: 'premultiplied',
    viewFormats: [],
  };
}

/**
 * Request a GPU adapter/device and configure the canvas context.
 * Sizes the backing canvas to the device pixel ratio.
 *
 * Returns the preferred presentation format on success, or `null` if no
 * adapter/device is available (caller should abort and fall back).
 */
export async function acquireGpuContext(view: GpuContextHost): Promise<GPUTextureFormat | null> {
  const bundle = await requestGpuAdapterAndDevice();
  if (!bundle) return null;

  view.device = bundle.device;
  view.gpuPowerPreference = bundle.powerPreference;
  view.enabledGpuFeatures = bundle.enabledFeatures;
  attachDeviceLifecycleHandlers(view);

  const dpr = window.devicePixelRatio || 1;
  view.canvasWebGPU.width = view.width * dpr;
  view.canvasWebGPU.height = view.height * dpr;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  view.ctxWebGPU.configure(buildCanvasConfiguration(view.device, presentationFormat));

  view.reactiveVideoBackground.setWebGPUDevice(view.device);
  return presentationFormat;
}

/**
 * Wire `device.lost` recovery and an `uncapturederror` listener. Idempotent per
 * device (each freshly created device gets its own handlers).
 */
export function attachDeviceLifecycleHandlers(view: GpuDeviceLifecycleHost): void {
  const device: GPUDevice = view.device;
  if (!device) return;

  device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => {
    const err = event.error;
    renderLogger.error(
      'Uncaptured GPU error',
      view._currentGpuScope ? `during ${view._currentGpuScope}` : '',
      '-',
      err?.constructor?.name || 'GPUError',
      ':',
      err?.message ?? err,
    );
  });

  void device.lost.then((info: GPUDeviceLostInfo) => {
    // 'destroyed' is an intentional teardown (e.g. re-init); don't treat as fatal.
    if (info.reason === 'destroyed') {
      renderLogger.info('GPU device destroyed (intentional)');
      return;
    }
    renderLogger.error(`GPU device lost: reason=${info.reason || 'unknown'} — ${info.message}`);
    void handleDeviceLost(view);
  });
}

/**
 * Attempt a single re-initialization after unexpected device loss; on failure,
 * surface an overlay and invoke the fatal hook (fallback chain) if present.
 */
async function handleDeviceLost(view: GpuDeviceLifecycleHost): Promise<void> {
  if (view._recoveringDevice) return;
  view._recoveringDevice = true;
  view._deviceLost = true;

  const canRecover = typeof view.preRender === 'function';
  showDeviceLostOverlay(
    view.element,
    canRecover ? 'GPU device lost — attempting recovery…' : 'GPU device lost…',
  );

  try {
    if (!canRecover) {
      throw new Error('no preRender recovery hook');
    }
    // preRender re-runs acquireGpuContext + resource setup on a fresh device.
    await view.preRender!();
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
export function pushGpuErrorScopes(view: GpuContextHost, scopeLabel: string): void {
  if (!view.device) return;
  view._currentGpuScope = scopeLabel;
  view.device.pushErrorScope('validation');
  view.device.pushErrorScope('out-of-memory');
}

/** Pop the scopes pushed by {@link pushGpuErrorScopes} and log any errors. */
export async function popGpuErrorScopes(view: GpuContextHost): Promise<void> {
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
export function resizeGpuContext(view: GpuContextHost): void {
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
  view.ctxWebGPU.configure(buildCanvasConfiguration(view.device, presentationFormat));

  view.postProcessor.resize(scaledWidth, scaledHeight);

  // Resize bloom system (async - GPU syncs before destroying old textures).
  if (view.bloomSystem) {
    view.bloomSystem.resize(scaledWidth, scaledHeight).catch(() => {});
  }
}
