/**
 * WebGPU boot probe (#485 follow-up).
 *
 * This game is WebGPU-only: the *active* renderer — TS WebGPU **or** the
 * Emscripten C++ renderer, never both — either gets a real GPU device or the
 * boot hard-fails (`webgpu/fatalBootOverlay.ts`). There is deliberately no
 * WebGL rescue. `window.webgpuProbe` is the single, always-set record of what
 * happened, so a failure in the field (or in CI) is a JSON blob away instead
 * of a guess from a stack trace.
 *
 * The probe never requests its own adapter/device — it reads the diagnostics
 * {@link import('./gpuContext.js').requestGpuAdapterAndDevice} already left
 * behind, so recording a probe never risks a second live device.
 */
import { getLastGpuAcquireDiagnostics } from './gpuContext.js';

export type ProbeRenderer = 'ts' | 'cpp';

export interface WebgpuProbeResult {
  ok: boolean;
  browser: string;
  reason: string | null;
  adapter: string | null;
  renderer: ProbeRenderer;
}

declare global {
  interface Window {
    webgpuProbe?: WebgpuProbeResult;
  }
}

function safeUserAgent(): string {
  try {
    return typeof navigator !== 'undefined' ? navigator.userAgent ?? '' : '';
  } catch {
    return '';
  }
}

/**
 * Chrome and Edge are both Chromium but gate WebGPU behind different flags,
 * so the acceptance bar for this probe is that they read differently in the
 * JSON — not just that we know "some Chromium browser" failed.
 */
export function detectBrowser(ua: string = safeUserAgent()): string {
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua) || /\bOPX\//.test(ua)) return 'opera';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Version\/.*Safari\//.test(ua)) return 'safari';
  return 'other';
}

/** Browser-specific hint appended to a failure reason (Chrome vs Edge flags differ). */
function annotateReasonForBrowser(reason: string, browser: string): string {
  if (browser === 'chrome') {
    return `${reason} (Chrome: check chrome://flags/#enable-unsafe-webgpu and GPU drivers)`;
  }
  if (browser === 'edge') {
    return `${reason} (Edge: check edge://flags/#enable-unsafe-webgpu and GPU drivers)`;
  }
  return reason;
}

export function recordWebgpuProbe(result: WebgpuProbeResult): void {
  if (typeof window === 'undefined') return;
  window.webgpuProbe = result;
}

/** The most recently recorded probe, or `null` if none has run yet. */
export function getWebgpuProbe(): WebgpuProbeResult | null {
  return typeof window !== 'undefined' ? window.webgpuProbe ?? null : null;
}

/**
 * Build and record the boot probe for the renderer that just attempted
 * acquisition. `reasonOverride` lets a caller report a failure that never
 * reached `requestGpuAdapterAndDevice` at all (e.g. the cpp wasm artifact is
 * missing from disk) instead of the last device-acquisition diagnostics.
 */
export function buildWebgpuProbe(
  renderer: ProbeRenderer,
  ok: boolean,
  reasonOverride?: string | null,
): WebgpuProbeResult {
  const diagnostics = getLastGpuAcquireDiagnostics();
  const browser = detectBrowser();
  const rawReason = ok ? null : (reasonOverride ?? diagnostics.reason ?? 'unknown-failure');
  const result: WebgpuProbeResult = {
    ok,
    browser,
    reason: rawReason ? annotateReasonForBrowser(rawReason, browser) : null,
    adapter: diagnostics.adapterDescription,
    renderer,
  };
  recordWebgpuProbe(result);
  return result;
}
