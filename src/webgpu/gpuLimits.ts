/**
 * Which `GPUSupportedLimits` this game asks for, and how they are reported.
 *
 * Every limit is derived from something the renderers actually allocate or bind —
 * nothing is requested "just in case":
 *
 *  - `maxStorageBuffersPerShaderStage` 4 / workgroup 64: the line-clear and particle
 *    compute shaders (see `REQUIRED_GPU_LIMITS` in `gpuContext.ts`).
 *  - `maxBindGroups` 1: every shader in `src/` and `cpp/src/shaders/` uses `@group(0)`
 *    only (`tests/gpu-limits.test.ts` greps for it, so a second group fails there
 *    first, not in a browser).
 *  - `maxTextureDimension2D`: the full-screen chain (offscreen, bloom input, backdrop,
 *    bloom pyramid) is canvas-sized. The default 8192 is enough unless the render-
 *    resolution policy can ask for more on this screen — only then is it raised.
 */

import { maxBackingDimension } from './renderResolution.js';

/** WebGPU's default `maxTextureDimension2D`. Below this nothing needs to be requested. */
export const DEFAULT_MAX_TEXTURE_DIMENSION_2D = 8192;

/** Limits always shown in the probe, whether or not they were requested: the ones that bite first. */
export const REPORTED_LIMIT_KEYS: readonly string[] = [
  'maxTextureDimension2D',
  'maxStorageBuffersPerShaderStage',
  'maxBindGroups',
  'maxComputeInvocationsPerWorkgroup',
  'maxColorAttachmentBytesPerSample',
];

export interface ScreenMetrics {
  /** `screen.width` / `screen.height` in CSS pixels. */
  width: number;
  height: number;
  devicePixelRatio: number;
}

/** Read the current screen; `null` outside a browser (tests, workers). */
export function readScreenMetrics(): ScreenMetrics | null {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return null;
  const width = screen.width;
  const height = screen.height;
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height, devicePixelRatio: window.devicePixelRatio || 1 };
}

/**
 * Limits to raise above the spec defaults for this screen. Empty on any screen whose
 * widest possible backing store fits the default 8192 — i.e. almost everywhere.
 */
export function desiredDisplayLimits(metrics: ScreenMetrics | null = readScreenMetrics()): Record<string, number> {
  if (!metrics) return {};
  const needed = maxBackingDimension(metrics.width, metrics.height, metrics.devicePixelRatio);
  return needed > DEFAULT_MAX_TEXTURE_DIMENSION_2D ? { maxTextureDimension2D: needed } : {};
}

/** Pick numeric limits by key from a `GPUSupportedLimits` (getter-based, not own-enumerable). */
export function readLimits(
  limits: object | null | undefined,
  keys: Iterable<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!limits) return out;
  const source = limits as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

/** What the probe records about limits: what we asked for, what the adapter could do, what we got. */
export interface GpuLimitsReport {
  requested: Record<string, number>;
  adapter: Record<string, number>;
  granted: Record<string, number>;
}

export function buildLimitsReport(
  requested: Record<string, number>,
  adapterLimits: object | null | undefined,
  deviceLimits: object | null | undefined,
): GpuLimitsReport {
  const keys = [...new Set([...Object.keys(requested), ...REPORTED_LIMIT_KEYS])];
  return {
    requested: { ...requested },
    adapter: readLimits(adapterLimits, keys),
    granted: readLimits(deviceLimits, keys),
  };
}
