/**
 * WebGPU device and canvas lifecycle helpers for the View renderer.
 *
 * Centralizes adapter/device acquisition policy (power preference, optional
 * feature detection, labels) and lifecycle resilience (device-loss recovery,
 * uncaptured-error logging, pipeline error scopes) so the WebGPU-TS renderer
 * and later surfaces (C++ handoff) can share the same behavior.
 */
import { renderLogger } from '../utils/logger.js';
import { loadGameSettings, type GameSettings } from '../config/gameSettings.js';
import { registerGpuDevice, type DeviceOwner } from './gpuChores/deviceRegistry.js';
import type { PerfOverlayAdapterInfo } from './perfOverlay.js';
import {
  buildCanvasConfiguration,
  configurePresentation,
  type PresentationState,
} from './presentation.js';
import { buildLimitsReport, desiredDisplayLimits, type GpuLimitsReport } from './gpuLimits.js';
import { resolveBackingSize } from './renderResolution.js';

export { buildCanvasConfiguration };

/**
 * Optional device features we *request when present*. These are never
 * hard-required — the device is created with only the subset the adapter
 * actually advertises, so absence degrades gracefully.
 *
 * **Every entry must be read by something** (`tests/gpu-context.test.ts` greps
 * `src/` and `cpp/src/` for it). Requesting a feature nothing uses still costs
 * device-creation work and can make `requestDevice` fail on a driver that
 * advertises it badly. `shader-f16` and `float32-filterable` were dropped for
 * exactly that reason (no `enable f16;`, no 32-bit-float texture); ASTC/ETC2 too —
 * the KTX2 albedo upgrade only handles BC7. Add a feature here in the same change
 * that adds its first use.
 */
export const DESIRED_OPTIONAL_FEATURES: GPUFeatureName[] = [
  'timestamp-query', // gpuPassTimers.ts
  'texture-compression-bc', // ktx2.ts (BC7 albedo upgrade)
  'rg11b10ufloat-renderable', // ibl/iblResources.ts (HDR playfield format)
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
  /** Info for the adapter the device came from (perf overlay); no extra request. */
  gpuAdapterInfo?: PerfOverlayAdapterInfo | null;
  /** Result of {@link configurePresentation}: what the canvas was configured with. */
  presentation?: PresentationState;
  /** Resolution-governor factor (1 = not engaged); see `renderResolution.ts`. */
  resolutionFactor?: number;
  userGameSettings?: Pick<GameSettings, 'quality'> | null;
}

export interface RequestGpuDeviceOptions {
  search?: string;
  storageValue?: string | null;
  deviceLabel?: string;
  /** Override the derived required limits (mainly for tests). */
  requiredLimits?: Record<string, number>;
  /**
   * Renderer requesting the device. Recorded in the single-device registry so
   * GPU chores adopt the device the *active* renderer owns — and so a handoff
   * (cpp renderer boots, fails, TS WebGPU takes over) retires the loser instead
   * of leaving two live devices in the session.
   */
  owner?: DeviceOwner;
}

export interface RequestGpuDeviceResult {
  adapter: GPUAdapter;
  device: GPUDevice;
  /** The power preference that was *requested* (the adapter may come from a later attempt). */
  powerPreference: GPUPowerPreference;
  /** Which rung of the adapter ladder produced `adapter`. */
  adapterAttempt: GpuAdapterAttempt;
  enabledFeatures: GPUFeatureName[];
  enabledLimits: Record<string, number>;
  /** Requested vs adapter vs granted limits, for the boot probe. */
  limits: GpuLimitsReport;
}

type AdapterWithInfo = GPUAdapter & {
  info?: GPUAdapterInfo;
  requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
};

/**
 * The adapter-request ladder, in order. Chromium often returns `null` for a
 * `powerPreference` it can't satisfy (e.g. `high-performance` on a single-GPU
 * or blocklisted-dGPU machine) even though the default adapter works, and
 * D3D11 / OpenGL ES class devices only expose WebGPU compatibility mode.
 *  1. `power-preference` — `requestAdapter({ powerPreference })`
 *  2. `default`          — `requestAdapter()`, no preference
 *  3. `compatibility`    — `requestAdapter({ featureLevel: 'compatibility' })`
 * Every rung is a WebGPU adapter; none switches graphics API.
 */
export type GpuAdapterAttempt = 'power-preference' | 'default' | 'compatibility';

/**
 * Last-attempt diagnostics from {@link requestGpuAdapterAndDevice}, for the
 * boot probe (`webgpu/bootProbe.ts`) to report *why* the active renderer
 * couldn't get a device — without a second adapter/device request of its own.
 * Module-level like `gpuChores/deviceRegistry.ts`: there is only ever one
 * acquisition attempt in flight per renderer boot.
 */
export interface GpuAcquireDiagnostics {
  /** Stable, greppable failure id, or `null` after a successful acquisition. */
  reason: string | null;
  /** Human-readable adapter description, when an adapter was obtained. */
  adapterDescription: string | null;
  /** Which adapter-ladder rung succeeded, or `null` if no adapter was obtained. */
  adapterAttempt: GpuAdapterAttempt | null;
  /** Features enabled on the device (empty when no device was created). */
  enabledFeatures: GPUFeatureName[];
  /** Requested vs adapter vs granted limits, or `null` when no adapter was obtained. */
  limits: GpuLimitsReport | null;
}

let lastAcquireDiagnostics: GpuAcquireDiagnostics = {
  reason: null,
  adapterDescription: null,
  adapterAttempt: null,
  enabledFeatures: [],
  limits: null,
};

/** Diagnostics from the most recent {@link requestGpuAdapterAndDevice} call. */
export function getLastGpuAcquireDiagnostics(): GpuAcquireDiagnostics {
  return lastAcquireDiagnostics;
}

function describeAdapter(adapter: GPUAdapter): string {
  const info = (adapter as AdapterWithInfo).info;
  if (!info) return 'unknown-adapter';
  return [info.vendor, info.architecture, info.device, info.description]
    .filter((part) => !!part)
    .join(' ') || 'unknown-adapter';
}

/**
 * GPU limits this renderer actually depends on: line-clear compute reads/
 * writes 4 storage buffers (board, dissolve, clearFlags, results) in one
 * shader stage, both the line-clear and particle compute passes dispatch
 * `@workgroup_size(64)`, and every shader binds `@group(0)` only. These sit at
 * or below WebGPU's default-limits tier (8 storage buffers/stage, 256
 * invocations/workgroup, 4 bind groups) — requesting them as `requiredLimits`
 * documents the floor and turns an adapter that somehow can't provide them into
 * a clear `requestDevice()` rejection instead of a cryptic validation error
 * deep inside a compute dispatch. Limits that must be *raised* for the current
 * screen (`maxTextureDimension2D`) come from `gpuLimits.ts#desiredDisplayLimits`.
 */
export const REQUIRED_GPU_LIMITS: Record<string, number> = {
  maxStorageBuffersPerShaderStage: 4,
  maxComputeWorkgroupSizeX: 64,
  maxComputeInvocationsPerWorkgroup: 64,
  maxBindGroups: 1,
};

/** The floor plus whatever this screen needs raised. */
export function defaultDesiredLimits(): Record<string, number> {
  return { ...REQUIRED_GPU_LIMITS, ...desiredDisplayLimits() };
}

/**
 * Clamp desired limits to what the adapter actually reports so `requestDevice`
 * never rejects for asking more than a weaker adapter can give; limits the
 * adapter doesn't report at all are omitted rather than guessed.
 */
export function resolveRequiredLimits(
  adapter: { limits?: GPUSupportedLimits | Record<string, number> } | null | undefined,
  desired: Record<string, number> = defaultDesiredLimits(),
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
export function resolveGpuPowerFromSettings(): string | null {
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Walk the {@link GpuAdapterAttempt} ladder and return the first adapter plus
 * the rung that produced it. Shared by the real acquisition and by
 * {@link isWebgpuAdapterAvailable} so the ladder, failure reasons and boot-probe
 * diagnostics stay identical. A rung that throws is treated like one that
 * returns null — the next rung still runs. Only when every rung fails is
 * `null` returned (hard-fail); the reason is `no-adapter` if all rungs
 * returned null, else the first thrown error.
 */
async function requestAdapterWithDiagnostics(
  powerPreference: GPUPowerPreference,
): Promise<{ adapter: GPUAdapter; attempt: GpuAdapterAttempt } | null> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    renderLogger.error('WebGPU is not available');
    lastAcquireDiagnostics = {
      reason: 'navigator.gpu-unavailable',
      adapterDescription: null,
      adapterAttempt: null,
      enabledFeatures: [],
      limits: null,
    };
    return null;
  }

  const gpu = navigator.gpu;
  const rungs: Array<[GpuAdapterAttempt, () => Promise<GPUAdapter | null>]> = [
    ['power-preference', () => gpu.requestAdapter({ powerPreference })],
    ['default', () => gpu.requestAdapter()],
    // `featureLevel` is newer than the bundled WebGPU typings.
    ['compatibility', () => gpu.requestAdapter({ featureLevel: 'compatibility' } as GPURequestAdapterOptions)],
  ];

  let firstError: string | null = null;
  for (const [attempt, request] of rungs) {
    try {
      const adapter = await request();
      if (adapter) {
        if (attempt !== 'power-preference') {
          renderLogger.warn(`WebGPU adapter acquired via "${attempt}" attempt (${powerPreference} unavailable)`);
        }
        return { adapter, attempt };
      }
      renderLogger.warn(`requestAdapter (${attempt}) returned no adapter`);
    } catch (err) {
      renderLogger.warn(`requestAdapter (${attempt}) threw:`, err);
      firstError ??= errorMessage(err);
    }
  }

  renderLogger.error('No WebGPU adapter available after all attempts');
  lastAcquireDiagnostics = {
    reason: firstError ? `request-adapter-threw: ${firstError}` : 'no-adapter',
    adapterDescription: null,
    adapterAttempt: null,
    enabledFeatures: [],
    limits: null,
  };
  return null;
}

/**
 * Read adapter info for the perf overlay from an adapter we already hold —
 * never a fresh `requestAdapter()`, so the overlay can't name a different GPU
 * than the device in use.
 */
export async function readAdapterInfo(adapter: GPUAdapter): Promise<PerfOverlayAdapterInfo | null> {
  try {
    const capable = adapter as AdapterWithInfo;
    const info = capable.info ?? (capable.requestAdapterInfo ? await capable.requestAdapterInfo() : undefined);
    if (!info) return null;
    return {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
    };
  } catch {
    return null; // adapter info is optional for the overlay
  }
}

/**
 * Adapter-only preflight: true when `navigator.gpu` exists and
 * `requestAdapter()` yields an adapter. It never requests a *device*, so it
 * can't create a second live device. Only the `auto` renderer preference uses
 * it, to choose WebGL2 up front instead of constructing a WebGPU view that
 * can't draw. On failure the reason is left in the acquire diagnostics.
 */
export async function isWebgpuAdapterAvailable(
  options: Pick<RequestGpuDeviceOptions, 'search' | 'storageValue'> = {},
): Promise<boolean> {
  const storageValue = options.storageValue !== undefined
    ? options.storageValue
    : resolveGpuPowerFromSettings();
  const powerPreference = resolvePowerPreference(options.search, storageValue);
  return (await requestAdapterWithDiagnostics(powerPreference)) !== null;
}

/**
 * Request a GPU adapter and device using the shared policy (power preference,
 * optional feature detection, labeled device with retry). Pure inputs can be
 * passed for unit tests; defaults read from window location / localStorage.
 */
export async function requestGpuAdapterAndDevice(
  options: RequestGpuDeviceOptions = {},
): Promise<RequestGpuDeviceResult | null> {
  const storageValue = options.storageValue !== undefined
    ? options.storageValue
    : resolveGpuPowerFromSettings();
  const powerPreference = resolvePowerPreference(options.search, storageValue);
  const deviceLabel = options.deviceLabel ?? 'tetris-main-device';

  const acquired = await requestAdapterWithDiagnostics(powerPreference);
  if (!acquired) return null;
  const { adapter, attempt: adapterAttempt } = acquired;
  logAdapterInfo(adapter, powerPreference);
  const adapterDescription = describeAdapter(adapter);

  const requiredFeatures = selectOptionalFeatures(adapter.features);
  if (requiredFeatures.length > 0) {
    renderLogger.info('Enabling optional features:', requiredFeatures.join(', '));
  }

  const requiredLimits = options.requiredLimits ?? resolveRequiredLimits(adapter);

  let device: GPUDevice;
  let enabledLimits = requiredLimits;
  let enabledFeatures = requiredFeatures;
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
      enabledFeatures = [];
    } catch (err2) {
      renderLogger.error('requestDevice failed:', err2);
      lastAcquireDiagnostics = {
        reason: `request-device-failed: ${errorMessage(err2)}`,
        adapterDescription,
        adapterAttempt,
        enabledFeatures: [],
        limits: buildLimitsReport(requiredLimits, adapter.limits, null),
      };
      return null;
    }
  }
  device.label = device.label || deviceLabel;
  registerGpuDevice(device, options.owner ?? 'unknown');
  const limits = buildLimitsReport(enabledLimits, adapter.limits, device.limits);
  lastAcquireDiagnostics = { reason: null, adapterDescription, adapterAttempt, enabledFeatures, limits };

  return { adapter, device, powerPreference, adapterAttempt, enabledFeatures, enabledLimits, limits };
}

/**
 * Request a GPU adapter/device and configure the canvas context.
 * Sizes the backing canvas to the device pixel ratio.
 *
 * Returns the preferred presentation format on success, or `null` if no
 * adapter/device is available (caller should abort and fall back).
 */
export async function acquireGpuContext(view: GpuContextHost): Promise<GPUTextureFormat | null> {
  const bundle = await requestGpuAdapterAndDevice({ owner: 'webgpu' });
  if (!bundle) return null;

  view.device = bundle.device;
  view.gpuPowerPreference = bundle.powerPreference;
  view.enabledGpuFeatures = bundle.enabledFeatures;
  view.gpuAdapterInfo = await readAdapterInfo(bundle.adapter);
  attachDeviceLifecycleHandlers(view);

  const backing = backingSizeFor(view);
  view.canvasWebGPU.width = backing.width;
  view.canvasWebGPU.height = backing.height;

  view.presentation = configurePresentation(view.ctxWebGPU, view.device, {
    sdrFormat: navigator.gpu.getPreferredCanvasFormat(),
    hdrSetting: resolveHdrSettingFromSettings(),
  });
  if (view.presentation.info.hdr) {
    renderLogger.info('HDR output active: rgba16float / display-p3 / extended tone mapping');
  } else if (view.presentation.info.hdrRequested) {
    renderLogger.warn(`HDR output requested but not active (${view.presentation.info.hdrStatus}); using SDR`);
  }

  view.reactiveVideoBackground.setWebGPUDevice(view.device);
  return view.presentation.info.format;
}

/** Persisted "HDR (if supported)" choice; `null` when settings are unreadable. */
function resolveHdrSettingFromSettings(): boolean | null {
  try {
    return loadGameSettings().hdrOutput;
  } catch {
    return null;
  }
}

/** Backing-store size from the render-resolution policy for the view's current state. */
function backingSizeFor(view: GpuContextHost) {
  let quality: GameSettings['quality'] = view.userGameSettings?.quality ?? 'ultra';
  if (!view.userGameSettings) {
    try {
      quality = loadGameSettings().quality;
    } catch {
      /* keep the default tier */
    }
  }
  return resolveBackingSize({
    cssWidth: view.width,
    cssHeight: view.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    renderScale: view.renderScale,
    quality,
    factor: view.resolutionFactor,
    maxTextureDimension: view.device?.limits?.maxTextureDimension2D,
  });
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
  view.width = window.innerWidth;
  view.height = window.innerHeight;

  // Render scale for supersampling, capped by the render-resolution policy
  // (DPR ceiling, per-quality pixel budget, device texture limit, governor factor).
  const backing = backingSizeFor(view);
  const scaledWidth = backing.width;
  const scaledHeight = backing.height;

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

  // Reuse exactly what acquisition applied (HDR / capture included) so the two paths cannot drift.
  view.ctxWebGPU.configure(
    view.presentation?.configuration ??
      buildCanvasConfiguration(view.device, navigator.gpu.getPreferredCanvasFormat()),
  );

  view.postProcessor.resize(scaledWidth, scaledHeight);

  // Resize bloom system (async - GPU syncs before destroying old textures).
  if (view.bloomSystem) {
    view.bloomSystem.resize(scaledWidth, scaledHeight).catch(() => {});
  }
}
